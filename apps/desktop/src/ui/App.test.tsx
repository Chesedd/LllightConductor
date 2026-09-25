import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

async function createProject(name = 'Aurora Show') {
  fireEvent.click(screen.getByRole('button', { name: 'New Project' }));
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await screen.findByLabelText(`${name} editor`);
}

describe('desktop application shell', () => {
  it('starts with New, Open, and an empty recent-projects state', () => { render(<App />); expect(screen.getByRole('button', { name: 'New Project' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Open Project' })).toBeInTheDocument(); expect(screen.getByText('No recent projects')).toBeInTheDocument(); });
  it('creates an unsaved dirty project directly in Editor', async () => { render(<App />); await createProject(); expect(screen.getByRole('heading', { name: 'Editor', level: 1 })).toBeInTheDocument(); expect(screen.getByLabelText('Project toolbar')).toHaveTextContent('Aurora Show *'); });
  it('shows Save and Save As actions', async () => { render(<App />); await createProject(); expect(screen.getByRole('button', { name: /Save$/ })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Save As' })).toBeInTheDocument(); expect(screen.getByText('Unsaved project')).toBeInTheDocument(); });
  it('shows the editor empty state before a project is selected', () => { render(<App />); fireEvent.click(screen.getByRole('button', { name: 'Editor' })); expect(screen.getByText('No project open')).toBeInTheDocument(); });
  it('asks before leaving a dirty project and Cancel keeps it open', async () => { render(<App />); await createProject(); fireEvent.click(screen.getByRole('button', { name: 'Projects' })); expect(screen.getByRole('dialog')).toHaveTextContent('Unsaved changes'); fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(screen.getByLabelText('Aurora Show editor')).toBeInTheDocument(); });
  it("Don't Save closes a dirty project", async () => { render(<App />); await createProject(); fireEvent.click(screen.getByRole('button', { name: 'Projects' })); fireEvent.click(screen.getByRole('button', { name: "Don't Save" })); expect(await screen.findByText('No recent projects')).toBeInTheDocument(); });
  it('navigates between non-destructive sections', () => { render(<App />); for (const name of ['Editor', 'Devices', 'Settings']) { fireEvent.click(screen.getByRole('button', { name })); expect(screen.getByRole('heading', { name, level: 1 })).toBeInTheDocument(); } });
});
