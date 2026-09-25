use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

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
        .invoke_handler(tauri::generate_handler![
            choose_project_to_open,
            choose_project_save_path,
            read_project_file,
            atomic_write_project_file
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
