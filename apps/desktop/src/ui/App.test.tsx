import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

async function createProject(name = 'Aurora Show') {
  fireEvent.click(screen.getByRole('button', { name: 'New Project' }));
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await screen.findByLabelText(`${name} editor`);
}

async function createChannel() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' })[0]); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' }).at(-1)!);
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Pico' }).at(-1)!); fireEvent.click(screen.getAllByRole('button', { name: 'Add Pico' }).at(-1)!);
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Channel' }).at(-1)!);
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Body outline' } });
  fireEvent.change(screen.getByLabelText('Hardware output identifier'), { target: { value: 'GP0' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Channel' }).at(-1)!);
  fireEvent.click(screen.getByRole('button', { name: 'Move Body outline up' }).closest('.tree-item')!);
}

describe('desktop application shell', () => {
  it('starts with New, Open, and an empty recent-projects state', () => { render(<App />); expect(screen.getByRole('button', { name: 'New Project' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Open Project' })).toBeInTheDocument(); expect(screen.getByText('No recent projects')).toBeInTheDocument(); });
  it('creates an unsaved dirty project directly in Editor', async () => { render(<App />); await createProject(); expect(screen.getByRole('heading', { name: 'Editor', level: 1 })).toBeInTheDocument(); expect(screen.getByLabelText('Project toolbar')).toHaveTextContent('Aurora Show *'); });
  it('shows Save and Save As actions', async () => { render(<App />); await createProject(); expect(screen.getByRole('button', { name: /Save$/ })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Save As' })).toBeInTheDocument(); expect(screen.getByText('Unsaved project')).toBeInTheDocument(); });
  it('compiles without changing dirty/history state, summarizes, previews, and invalidates after an edit', async () => {
    render(<App />); await createProject();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Compile' }));
    const summary = screen.getByRole('dialog'); expect(summary).toHaveTextContent('Compiled successfully'); expect(summary).toHaveTextContent('00:00.000'); expect(summary).toHaveTextContent('Masters0'); expect(screen.getByLabelText('Project toolbar')).toHaveTextContent('Aurora Show *'); expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'View Runtime Score' }).at(-1)!);
    expect(screen.getByLabelText('Runtime Score JSON')).toHaveTextContent('"version": 1'); fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'View Runtime Score' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' })[0]); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' }).at(-1)!);
    expect(screen.queryByRole('button', { name: 'View Runtime Score' })).not.toBeInTheDocument();
  });
  it('shows the editor empty state before a project is selected', () => { render(<App />); fireEvent.click(screen.getByRole('button', { name: 'Editor' })); expect(screen.getByText('No project open')).toBeInTheDocument(); });
  it('asks before leaving a dirty project and Cancel keeps it open', async () => { render(<App />); await createProject(); fireEvent.click(screen.getByRole('button', { name: 'Projects' })); expect(screen.getByRole('dialog')).toHaveTextContent('Unsaved changes'); fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(screen.getByLabelText('Aurora Show editor')).toBeInTheDocument(); });
  it("Don't Save closes a dirty project", async () => { render(<App />); await createProject(); fireEvent.click(screen.getByRole('button', { name: 'Projects' })); fireEvent.click(screen.getByRole('button', { name: "Don't Save" })); expect(await screen.findByText('No recent projects')).toBeInTheDocument(); });
  it('navigates between non-destructive sections', () => { render(<App />); for (const name of ['Editor', 'Devices', 'Settings']) { fireEvent.click(screen.getByRole('button', { name })); expect(screen.getByRole('heading', { name, level: 1 })).toBeInTheDocument(); } });

  it('builds and displays a costume, ESP32 master, Pico, and EL wire channel', async () => {
    render(<App />); await createProject();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' })[0]);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Neon Suit' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' }).at(-1)!);
    expect(screen.getByText('ESP32 Master')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Pico' }).at(-1)!);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Torso Controller' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Pico' }).at(-1)!);
    expect(screen.getByText('Pico 0')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Channel' }).at(-1)!);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Body outline' } });
    fireEvent.change(screen.getByLabelText('Hardware output identifier'), { target: { value: '  OUT1  ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Channel' }).at(-1)!);
    expect(screen.getByText('Body outline')).toBeInTheDocument();
    expect(screen.getByLabelText('Project toolbar')).toHaveTextContent('Aurora Show *');
  });

  it('shows contextual inspector fields and keeps stable IDs secondary', async () => {
    render(<App />); await createProject();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' })[0]); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' }).at(-1)!);
    fireEvent.click(screen.getByText('Costume 1'));
    expect(screen.getByRole('heading', { name: 'Costume' })).toBeInTheDocument();
    expect(screen.getByText('Stable ID')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed Costume' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(screen.getByText('Renamed Costume')).toBeInTheDocument();
  });

  it('edits Pico Output IDs and exposes the two-stage Compile → Prepare pipeline', async () => {
    render(<App />); await createProject();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' })[0]); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' }).at(-1)!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Pico' }).at(-1)!); fireEvent.click(screen.getAllByRole('button', { name: 'Add Pico' }).at(-1)!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Channel' }).at(-1)!); fireEvent.change(screen.getByLabelText('Hardware output identifier'), { target: { value: 'GP15' } }); fireEvent.click(screen.getAllByRole('button', { name: 'Add Channel' }).at(-1)!);
    fireEvent.click(screen.getByText('EL Wire Channel'));
    expect(screen.getByLabelText('Pico Output ID')).toHaveValue(''); expect(screen.getByText(/Numeric output ID used by Pico Protocol v2/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pico Output ID'), { target: { value: '256' } }); fireEvent.click(screen.getByRole('button', { name: 'Apply changes' })); expect(screen.getByRole('alert')).toHaveTextContent('0 to 255');
    fireEvent.change(screen.getByLabelText('Pico Output ID'), { target: { value: '0' } }); fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    expect(screen.getByRole('button', { name: 'Prepare for Hardware' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: 'Compile' })); fireEvent.click(screen.getByRole('button', { name: 'Done' })); expect(screen.getByRole('button', { name: 'Prepare for Hardware' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare for Hardware' })); expect(screen.getByRole('dialog')).toHaveTextContent('Hardware preparation successful'); expect(screen.getByRole('dialog')).toHaveTextContent('Masters1'); fireEvent.click(screen.getAllByRole('button', { name: 'View Prepared Show' }).at(-1)!); expect(screen.getByLabelText('Prepared Show JSON')).toHaveTextContent('"version": 1');
  });

  it.each([
    ['Costume', async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' })[0]); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' }).at(-1)!); }],
    ['Pico', async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' })[0]); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' }).at(-1)!); fireEvent.click(screen.getAllByRole('button', { name: 'Add Pico' }).at(-1)!); fireEvent.click(screen.getAllByRole('button', { name: 'Add Pico' }).at(-1)!); }],
    ['Channel', async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' })[0]); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' }).at(-1)!); fireEvent.click(screen.getAllByRole('button', { name: 'Add Pico' }).at(-1)!); fireEvent.click(screen.getAllByRole('button', { name: 'Add Pico' }).at(-1)!); fireEvent.click(screen.getAllByRole('button', { name: 'Add Channel' }).at(-1)!); fireEvent.change(screen.getByLabelText('Hardware output identifier'), { target: { value: 'GP0' } }); fireEvent.click(screen.getAllByRole('button', { name: 'Add Channel' }).at(-1)!); }],
  ])('requires confirmation before deleting a %s', async (kind, setupTopology) => {
    render(<App />); await createProject(); await setupTopology();
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' }); fireEvent.click(deleteButtons.at(-1)!);
    expect(screen.getByRole('dialog')).toHaveTextContent(`Delete ${kind}`);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('clears selection when its selected ancestor is deleted', async () => {
    render(<App />); await createProject(); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' })[0]); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' }).at(-1)!);
    fireEvent.click(screen.getByText('ESP32 Master')); expect(screen.getByRole('heading', { name: 'ESP32 Master' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' })); fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    expect(screen.getByText('No selection')).toBeInTheDocument();
  });

  it('collapses and expands topology without changing project dirty state', async () => {
    render(<App />); await createProject(); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' })[0]); fireEvent.click(screen.getAllByRole('button', { name: 'Add Costume' }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Costume 1' })); expect(screen.queryByText('ESP32 Master')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Costume 1' })); expect(screen.getByText('ESP32 Master')).toBeInTheDocument(); expect(screen.getByLabelText('Project toolbar')).toHaveTextContent('Aurora Show *');
  });

  it('creates, selects, validates, cancels, and undoes a precisely timed score interval', async () => {
    render(<App />); await createProject(); await createChannel();
    expect(screen.getByRole('button', { name: '+ Add Interval' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Add Interval' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Add Light Interval'); expect(dialog).toHaveTextContent('Body outline');
    expect(screen.getByLabelText('Start')).toHaveValue('00:00.000'); expect(screen.getByLabelText('End')).toHaveValue('00:01.000');

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: 'not a time' } }); fireEvent.click(screen.getByRole('button', { name: 'Add Interval' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter time as MM:SS.mmm, HH:MM:SS.mmm, or milliseconds.');
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '00:01.250' } }); fireEvent.change(screen.getByLabelText('End'), { target: { value: '00:01.250' } }); fireEvent.click(screen.getByRole('button', { name: 'Add Interval' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The interval must end after it starts.');
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '00:01.780' } }); fireEvent.click(screen.getByRole('button', { name: 'Add Interval' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByText('EVENT INSPECTOR')).toBeInTheDocument();
    expect(screen.getByLabelText('Start')).toHaveValue('00:01.250'); expect(screen.getByLabelText('End')).toHaveValue('00:01.780');
    expect(screen.getByRole('button', { name: /Body outline light interval/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Move Body outline up' }).closest('.tree-item')!); fireEvent.click(screen.getByRole('button', { name: '+ Add Interval' }));
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '1300' } }); fireEvent.change(screen.getByLabelText('End'), { target: { value: '1600' } }); fireEvent.click(screen.getByRole('button', { name: 'Add Interval' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The interval overlaps another event on this channel.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getAllByRole('button', { name: /Body outline light interval/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' })); expect(screen.queryByRole('button', { name: /Body outline light interval/ })).not.toBeInTheDocument();
  });
});
