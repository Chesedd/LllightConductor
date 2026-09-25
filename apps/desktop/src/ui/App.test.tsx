import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('starts on Projects and navigates without hardware dependencies', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Your projects' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }));
    expect(screen.getByText('Hardware discovery and diagnostics will live here.')).toBeInTheDocument();
  });
});
