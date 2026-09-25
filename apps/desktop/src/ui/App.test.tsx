import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

function createProject(name = 'Aurora Show') {
  fireEvent.click(screen.getByRole('button', { name: 'New Project' }));
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
}

describe('desktop application shell', () => {
  it('starts on Projects with an empty state', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Projects', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
  });

  it('creates a named project and displays its summary', async () => {
    render(<App />); createProject();
    expect(await screen.findByRole('heading', { name: 'Aurora Show' })).toBeInTheDocument();
    expect(screen.getByText(/0 costumes/)).toBeInTheDocument();
    expect(screen.getByText(/No audio/)).toBeInTheDocument();
  });

  it('renames a project', async () => {
    render(<App />); createProject();
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Aurora Show' }));
    const input = screen.getByLabelText('Project name');
    fireEvent.change(input, { target: { value: 'Finale' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('heading', { name: 'Finale' })).toBeInTheDocument();
  });

  it('requires confirmation and deletes a project', async () => {
    render(<App />); createProject();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Aurora Show' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete project?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('opens a project in Editor and displays its name', async () => {
    render(<App />); createProject();
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(screen.getByRole('heading', { name: 'Editor', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('Project structure')).toHaveTextContent('Aurora Show');
    expect(screen.getByText('Timeline will appear here')).toBeInTheDocument();
  });

  it('shows an Editor empty state when no project is selected', () => {
    render(<App />); fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    expect(screen.getByText('No project open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Projects' })).toBeInTheDocument();
  });

  it('navigates between all main sections', () => {
    render(<App />);
    for (const name of ['Editor', 'Devices', 'Settings', 'Projects']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(screen.getByRole('heading', { name, level: 1 })).toBeInTheDocument();
    }
  });

  it('clears the active project when that project is deleted', async () => {
    render(<App />); createProject();
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Aurora Show' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
    expect(await screen.findByText('No project open')).toBeInTheDocument();
  });
});
