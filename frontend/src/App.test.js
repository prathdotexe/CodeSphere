import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

test('renders app', () => {
  render(<App />);
  expect(screen.getByText(/Hello CodeSphere/i)).toBeInTheDocument();
});
