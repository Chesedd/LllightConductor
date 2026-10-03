use serde::Serialize;
use std::{
    fs,
    io::{Read, Write},
    net::{Shutdown, TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::Duration,
};
use tauri::Emitter;

const SERIAL_BAUD: u32 = 460_800;

#[derive(Default)]
struct SerialState {
    open: Mutex<Option<OpenSerial>>,
    next_generation: AtomicU32,
}
struct OpenSerial {
    generation: u32,
    port_name: String,
    writer: Box<dyn serialport::SerialPort>,
    stop: Arc<AtomicBool>,
    reader: Option<JoinHandle<()>>,
}

#[derive(Default)]
struct TcpState {
    open: Mutex<Option<OpenTcp>>,
    next_generation: AtomicU32,
}
struct OpenTcp {
    generation: u32,
    endpoint: String,
    writer: TcpStream,
    stop: Arc<AtomicBool>,
    reader: Option<JoinHandle<()>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SerialPortInfo {
    port_name: String,
    port_type: String,
    vid: Option<u16>,
    pid: Option<u16>,
    manufacturer: Option<String>,
    product: Option<String>,
    serial_number: Option<String>,
}

#[derive(Clone, Serialize)]
struct SerialCommandError {
    code: &'static str,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerialBytesEvent {
    generation: u32,
    bytes: Vec<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerialDisconnectEvent {
    generation: u32,
    error: SerialCommandError,
}
impl SerialCommandError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

fn map_open_error(name: &str, error: serialport::Error) -> SerialCommandError {
    let message = error.to_string();
    match error.kind() {
        serialport::ErrorKind::NoDevice => SerialCommandError::new("PortNotFound", name),
        serialport::ErrorKind::Io(std::io::ErrorKind::PermissionDenied) => {
            SerialCommandError::new("PermissionDenied", message)
        }
        serialport::ErrorKind::Io(std::io::ErrorKind::WouldBlock) => {
            SerialCommandError::new("PortBusy", message)
        }
        _ if message.to_ascii_lowercase().contains("access is denied")
            || message.to_ascii_lowercase().contains("access denied") =>
        {
            SerialCommandError::new("PermissionDenied", message)
        }
        _ if message.to_ascii_lowercase().contains("busy")
            || message.to_ascii_lowercase().contains("in use") =>
        {
            SerialCommandError::new("PortBusy", message)
        }
        _ => SerialCommandError::new("OpenFailed", message),
    }
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<SerialPortInfo>, SerialCommandError> {
    serialport::available_ports()
        .map_err(|e| SerialCommandError::new("OpenFailed", e.to_string()))
        .map(|ports| {
            ports
                .into_iter()
                .map(|p| {
                    let (port_type, vid, pid, manufacturer, product, serial_number) =
                        match p.port_type {
                            serialport::SerialPortType::UsbPort(u) => (
                                "usb",
                                Some(u.vid),
                                Some(u.pid),
                                u.manufacturer,
                                u.product,
                                u.serial_number,
                            ),
                            serialport::SerialPortType::BluetoothPort => {
                                ("bluetooth", None, None, None, None, None)
                            }
                            serialport::SerialPortType::PciPort => {
                                ("pci", None, None, None, None, None)
                            }
                            serialport::SerialPortType::Unknown => {
                                ("unknown", None, None, None, None, None)
                            }
                        };
                    SerialPortInfo {
                        port_name: p.port_name,
                        port_type: port_type.into(),
                        vid,
                        pid,
                        manufacturer,
                        product,
                        serial_number,
                    }
                })
                .collect()
        })
}

#[tauri::command]
fn open_serial_port(
    app: tauri::AppHandle,
    state: tauri::State<SerialState>,
    port_name: String,
) -> Result<u32, SerialCommandError> {
    let mut slot = state
        .open
        .lock()
        .map_err(|_| SerialCommandError::new("OpenFailed", "serial state poisoned"))?;
    if slot
        .as_ref()
        .and_then(|open| open.reader.as_ref())
        .is_some_and(JoinHandle::is_finished)
    {
        if let Some(mut stale) = slot.take() {
            if let Some(reader) = stale.reader.take() {
                let _ = reader.join();
            }
        }
    }
    if slot.is_some() {
        return Err(SerialCommandError::new(
            "PortBusy",
            "another serial port is already open",
        ));
    }
    let writer = serialport::new(&port_name, SERIAL_BAUD)
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| map_open_error(&port_name, e))?;
    let mut reader = writer
        .try_clone()
        .map_err(|e| SerialCommandError::new("OpenFailed", e.to_string()))?;
    let stop = Arc::new(AtomicBool::new(false));
    let generation = state.next_generation.fetch_add(1, Ordering::Relaxed);
    let reader_stop = stop.clone();
    let reader_name = port_name.clone();
    let handle = std::thread::spawn(move || {
        let mut bytes = [0u8; 4096];
        while !reader_stop.load(Ordering::Acquire) {
            match reader.read(&mut bytes) {
                Ok(n) if n > 0 => {
                    let _ = app.emit(
                        "serial://bytes",
                        SerialBytesEvent {
                            generation,
                            bytes: bytes[..n].to_vec(),
                        },
                    );
                }
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(e) => {
                    if !reader_stop.load(Ordering::Acquire) {
                        let _ = app.emit(
                            "serial://disconnect",
                            SerialDisconnectEvent {
                                generation,
                                error: SerialCommandError::new(
                                    "ReadFailed",
                                    format!("{reader_name}: {e}"),
                                ),
                            },
                        );
                    }
                    break;
                }
            }
        }
    });
    *slot = Some(OpenSerial {
        generation,
        port_name,
        writer,
        stop,
        reader: Some(handle),
    });
    Ok(generation)
}

#[tauri::command]
fn write_serial(
    state: tauri::State<SerialState>,
    generation: u32,
    bytes: Vec<u8>,
) -> Result<(), SerialCommandError> {
    let mut slot = state
        .open
        .lock()
        .map_err(|_| SerialCommandError::new("Disconnected", "serial state poisoned"))?;
    let open = slot
        .as_mut()
        .ok_or_else(|| SerialCommandError::new("Disconnected", "no serial port is open"))?;
    if open.generation != generation {
        return Err(SerialCommandError::new(
            "Disconnected",
            "serial connection generation is stale",
        ));
    }
    open.writer
        .write_all(&bytes)
        .map_err(|e| SerialCommandError::new("WriteFailed", format!("{}: {e}", open.port_name)))
}

#[tauri::command]
fn close_serial_port(
    state: tauri::State<SerialState>,
    generation: u32,
) -> Result<(), SerialCommandError> {
    let mut slot = state
        .open
        .lock()
        .map_err(|_| SerialCommandError::new("Disconnected", "serial state poisoned"))?;
    let mut open = if slot
        .as_ref()
        .is_some_and(|open| open.generation == generation)
    {
        slot.take()
    } else {
        None
    };
    drop(slot);
    if let Some(ref mut value) = open {
        value.stop.store(true, Ordering::Release);
        if let Some(reader) = value.reader.take() {
            let _ = reader.join();
        }
    }
    Ok(())
}

fn connect_tcp(host: &str, port: u16) -> Result<TcpStream, SerialCommandError> {
    if host.trim().is_empty() {
        return Err(SerialCommandError::new("OpenFailed", "TCP host is empty"));
    }
    let endpoint = format!("{}:{port}", host.trim());
    let addresses = endpoint.to_socket_addrs().map_err(|e| {
        SerialCommandError::new("OpenFailed", format!("cannot resolve {endpoint}: {e}"))
    })?;
    let mut last = None;
    for address in addresses {
        match TcpStream::connect_timeout(&address, Duration::from_secs(5)) {
            Ok(stream) => return Ok(stream),
            Err(error) => last = Some(error),
        }
    }
    Err(SerialCommandError::new(
        "OpenFailed",
        format!(
            "cannot connect to {endpoint}: {}",
            last.map(|e| e.to_string())
                .unwrap_or_else(|| "no address found".into())
        ),
    ))
}

#[tauri::command]
async fn open_tcp_connection(
    app: tauri::AppHandle,
    state: tauri::State<'_, TcpState>,
    host: String,
    port: u16,
) -> Result<u32, SerialCommandError> {
    let stream = tauri::async_runtime::spawn_blocking(move || connect_tcp(&host, port))
        .await
        .map_err(|e| SerialCommandError::new("OpenFailed", e.to_string()))??;
    stream
        .set_read_timeout(Some(Duration::from_millis(100)))
        .map_err(|e| SerialCommandError::new("OpenFailed", e.to_string()))?;
    stream
        .set_nodelay(true)
        .map_err(|e| SerialCommandError::new("OpenFailed", e.to_string()))?;
    let mut reader = stream
        .try_clone()
        .map_err(|e| SerialCommandError::new("OpenFailed", e.to_string()))?;
    let endpoint = stream
        .peer_addr()
        .map(|a| a.to_string())
        .unwrap_or_else(|_| "TCP peer".into());
    let mut slot = state
        .open
        .lock()
        .map_err(|_| SerialCommandError::new("OpenFailed", "TCP state poisoned"))?;
    if slot.is_some() {
        return Err(SerialCommandError::new(
            "PortBusy",
            "another TCP connection is already open",
        ));
    }
    let generation = state.next_generation.fetch_add(1, Ordering::Relaxed);
    let stop = Arc::new(AtomicBool::new(false));
    let reader_stop = stop.clone();
    let reader_endpoint = endpoint.clone();
    let handle = std::thread::spawn(move || {
        let mut bytes = [0u8; 4096];
        while !reader_stop.load(Ordering::Acquire) {
            match reader.read(&mut bytes) {
                Ok(0) => {
                    if !reader_stop.load(Ordering::Acquire) {
                        let _ = app.emit(
                            "tcp://disconnect",
                            SerialDisconnectEvent {
                                generation,
                                error: SerialCommandError::new(
                                    "Disconnected",
                                    format!("{reader_endpoint}: peer closed connection"),
                                ),
                            },
                        );
                    }
                    break;
                }
                Ok(n) => {
                    let _ = app.emit(
                        "tcp://bytes",
                        SerialBytesEvent {
                            generation,
                            bytes: bytes[..n].to_vec(),
                        },
                    );
                }
                Err(e)
                    if matches!(
                        e.kind(),
                        std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                    ) => {}
                Err(e) => {
                    if !reader_stop.load(Ordering::Acquire) {
                        let _ = app.emit(
                            "tcp://disconnect",
                            SerialDisconnectEvent {
                                generation,
                                error: SerialCommandError::new(
                                    "ReadFailed",
                                    format!("{reader_endpoint}: {e}"),
                                ),
                            },
                        );
                    }
                    break;
                }
            }
        }
    });
    *slot = Some(OpenTcp {
        generation,
        endpoint,
        writer: stream,
        stop,
        reader: Some(handle),
    });
    Ok(generation)
}

#[tauri::command]
fn write_tcp(
    state: tauri::State<TcpState>,
    generation: u32,
    bytes: Vec<u8>,
) -> Result<(), SerialCommandError> {
    let mut slot = state
        .open
        .lock()
        .map_err(|_| SerialCommandError::new("Disconnected", "TCP state poisoned"))?;
    let open = slot
        .as_mut()
        .ok_or_else(|| SerialCommandError::new("Disconnected", "no TCP connection is open"))?;
    if open.generation != generation {
        return Err(SerialCommandError::new(
            "Disconnected",
            "TCP connection generation is stale",
        ));
    }
    open.writer
        .write_all(&bytes)
        .map_err(|e| SerialCommandError::new("WriteFailed", format!("{}: {e}", open.endpoint)))
}

#[tauri::command]
fn close_tcp_connection(
    state: tauri::State<TcpState>,
    generation: u32,
) -> Result<(), SerialCommandError> {
    let mut slot = state
        .open
        .lock()
        .map_err(|_| SerialCommandError::new("Disconnected", "TCP state poisoned"))?;
    let mut open = if slot.as_ref().is_some_and(|o| o.generation == generation) {
        slot.take()
    } else {
        None
    };
    drop(slot);
    if let Some(ref mut value) = open {
        value.stop.store(true, Ordering::Release);
        let _ = value.writer.shutdown(Shutdown::Both);
        if let Some(reader) = value.reader.take() {
            let _ = reader.join();
        }
    }
    Ok(())
}

#[tauri::command]
fn choose_project_to_open() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Lllight Conductor project", &["lightshow"])
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn choose_project_save_path(suggested_name: String) -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Lllight Conductor project", &["lightshow"])
        .set_file_name(&suggested_name)
        .save_file()
        .map(|path| {
            let path = if path.extension().is_none() {
                path.with_extension("lightshow")
            } else {
                path
            };
            path.to_string_lossy().into_owned()
        })
}

#[tauri::command]
fn choose_audio_file() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Supported audio", &["mp3", "wav"])
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn audio_file_exists(path: String) -> bool {
    Path::new(&path).is_file()
}

#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn atomic_write_project_file(path: String, contents: String) -> Result<(), String> {
    atomic_write(Path::new(&path), contents.as_bytes(), false).map_err(|error| error.to_string())
}

fn atomic_write(target: &Path, contents: &[u8], fail_before_replace: bool) -> std::io::Result<()> {
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let mut attempt = 0_u32;
    let (temporary_path, mut temporary) = loop {
        let candidate = temporary_name(target, attempt);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => break (candidate, file),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => attempt += 1,
            Err(error) => return Err(error),
        }
    };
    let result = (|| {
        temporary.write_all(contents)?;
        temporary.sync_all()?;
        drop(temporary);
        if fail_before_replace {
            return Err(std::io::Error::other("injected failure before replace"));
        }
        replace_file(&temporary_path, target)?;
        if let Ok(directory) = fs::File::open(parent) {
            let _ = directory.sync_all();
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn temporary_name(target: &Path, attempt: u32) -> PathBuf {
    let name = target.file_name().unwrap_or_default().to_string_lossy();
    target.with_file_name(format!(".{name}.{}.{}.tmp", std::process::id(), attempt))
}

#[cfg(not(target_os = "windows"))]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(source, target)
}

// std::fs::rename cannot replace a file on Windows. A rollback copy ensures the old
// project remains recoverable if promoting the completely flushed temp file fails.
#[cfg(target_os = "windows")]
fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    if !target.exists() {
        return fs::rename(source, target);
    }
    let backup = target.with_extension("lightshow.backup");
    let _ = fs::remove_file(&backup);
    fs::rename(target, &backup)?;
    match fs::rename(source, target) {
        Ok(()) => {
            let _ = fs::remove_file(backup);
            Ok(())
        }
        Err(error) => {
            let _ = fs::rename(backup, target);
            Err(error)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SerialState::default())
        .manage(TcpState::default())
        .invoke_handler(tauri::generate_handler![
            choose_project_to_open,
            choose_project_save_path,
            choose_audio_file,
            audio_file_exists,
            read_project_file,
            atomic_write_project_file,
            list_serial_ports,
            open_serial_port,
            write_serial,
            close_serial_port,
            open_tcp_connection,
            write_tcp,
            close_tcp_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lllight Conductor");
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("lllight-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn rejects_empty_tcp_host_without_network_io() {
        let error = connect_tcp("  ", 3333).unwrap_err();
        assert_eq!(error.code, "OpenFailed");
        assert!(error.message.contains("host is empty"));
    }
    #[test]
    fn creates_new_file() {
        let dir = directory("create");
        let path = dir.join("show.lightshow");
        atomic_write(&path, b"new", false).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn replaces_existing_file() {
        let dir = directory("replace");
        let path = dir.join("show.lightshow");
        fs::write(&path, "old").unwrap();
        atomic_write(&path, b"new", false).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn failure_before_replace_preserves_existing_file() {
        let dir = directory("failure");
        let path = dir.join("show.lightshow");
        fs::write(&path, "old").unwrap();
        assert!(atomic_write(&path, b"new", true).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"old");
        fs::remove_dir_all(dir).unwrap();
    }
}
