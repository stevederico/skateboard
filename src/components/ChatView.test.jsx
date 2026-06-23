import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ChatView from './ChatView.jsx';

const getRemainingUsage = vi.fn();
const trackUsage = vi.fn();
const showUpgradeSheet = vi.fn();
const dispatch = vi.fn();

let currentUser = { email: 'user@example.com' };

vi.mock('@stevederico/skateboard-ui/Utilities', () => ({
  getRemainingUsage: (...args) => getRemainingUsage(...args),
  trackUsage: (...args) => trackUsage(...args),
  showUpgradeSheet: (...args) => showUpgradeSheet(...args)
}));

vi.mock('@stevederico/skateboard-ui/Context', () => ({
  useUser: () => currentUser,
  useDispatch: () => dispatch
}));

vi.mock('@stevederico/skateboard-ui/Header', () => ({
  default: ({ title, buttonTitle, onButtonTitleClick }) => (
    <header data-testid="header">
      <span>{title}</span>
      {buttonTitle ? (
        <button type="button" data-testid="usage-button" onClick={onButtonTitleClick}>
          {buttonTitle}
        </button>
      ) : null}
    </header>
  )
}));

vi.mock('@stevederico/skateboard-ui/UpgradeSheet', () => ({
  default: vi.fn().mockImplementation(() => <div data-testid="upgrade-sheet" />)
}));

vi.mock('@stevederico/skateboard-ui/DynamicIcon', () => ({
  default: () => <span data-testid="send-icon" />
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/input', () => ({
  Input: (props) => <input data-testid="message-input" {...props} />
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>{children}</button>
  )
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/card', () => ({
  Card: ({ children, className }) => <div className={className}>{children}</div>,
  CardContent: ({ children }) => <div>{children}</div>
}));

vi.mock('@stevederico/skateboard-ui/shadcn/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }) => (
    open ? (
      <div data-testid="usage-error-dialog">
        <button type="button" onClick={() => onOpenChange(false)}>close-dialog</button>
        {children}
      </div>
    ) : null
  ),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>
}));

let uuidCounter = 0;

describe('ChatView', () => {
  beforeEach(() => {
    uuidCounter = 0;
    currentUser = { email: 'user@example.com' };
    getRemainingUsage.mockReset();
    trackUsage.mockReset();
    showUpgradeSheet.mockReset();
    dispatch.mockReset();
    getRemainingUsage.mockResolvedValue({ remaining: -1, isSubscriber: true });
    trackUsage.mockResolvedValue({ remaining: -1, isSubscriber: true });
    crypto.randomUUID = vi.fn(() => `uuid-${++uuidCounter}`);
  });

  it('renders initial messages and chat header', async () => {
    render(<ChatView />);

    await waitFor(() => {
      expect(screen.getByTestId('header')).toHaveTextContent('Chat');
    });

    expect(screen.getByText("Hey there! 👋")).toBeInTheDocument();
    expect(screen.getByText("Hi! How's it going?")).toBeInTheDocument();
  });

  it('shows usage error dialog when getRemainingUsage fails', async () => {
    getRemainingUsage.mockRejectedValueOnce(new Error('network'));
    render(<ChatView />);

    await waitFor(() => {
      expect(screen.getByTestId('usage-error-dialog')).toBeInTheDocument();
    });

    expect(screen.getByText("Couldn't load usage")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('usage-error-dialog')).not.toBeInTheDocument();
  });

  it('clears usage error when dialog onOpenChange receives false', async () => {
    getRemainingUsage.mockRejectedValueOnce(new Error('network'));
    render(<ChatView />);

    await waitFor(() => {
      expect(screen.getByTestId('usage-error-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'close-dialog' }));
    expect(screen.queryByTestId('usage-error-dialog')).not.toBeInTheDocument();
  });

  it('does not send when message is empty or whitespace', async () => {
    render(<ChatView />);

    await waitFor(() => {
      expect(screen.getByTestId('message-input')).not.toBeDisabled();
    });

    fireEvent.change(screen.getByTestId('message-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(trackUsage).not.toHaveBeenCalled();
    expect(screen.queryByText('uuid-user')).not.toBeInTheDocument();
  });

  it('shows upgrade sheet when non-subscriber has no remaining usage', async () => {
    getRemainingUsage.mockResolvedValueOnce({ remaining: 0, isSubscriber: false });
    render(<ChatView />);

    await waitFor(() => {
      expect(screen.getByTestId('usage-button')).toHaveTextContent('0');
    });

    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(showUpgradeSheet).toHaveBeenCalled();
    expect(trackUsage).not.toHaveBeenCalled();
  });

  it('opens upgrade sheet from header usage button for non-subscribers', async () => {
    getRemainingUsage.mockResolvedValueOnce({ remaining: 2, isSubscriber: false });
    render(<ChatView />);

    await waitFor(() => {
      expect(screen.getByTestId('usage-button')).toHaveTextContent('2');
    });

    fireEvent.click(screen.getByTestId('usage-button'));
    expect(showUpgradeSheet).toHaveBeenCalled();
  });

  it('sends message, tracks usage, and adds demo AI response', async () => {
    trackUsage.mockResolvedValueOnce({ remaining: 5, isSubscriber: false });
    render(<ChatView />);

    await waitFor(() => {
      expect(screen.getByTestId('message-input')).not.toBeDisabled();
    });

    vi.useFakeTimers();
    try {
      fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'New message' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

      expect(screen.getByText('New message')).toBeInTheDocument();
      expect(trackUsage).toHaveBeenCalledWith('messages');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(screen.getByText('This is a demo response. Connect your LLM API here.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends message on Enter key when user is authenticated', async () => {
    render(<ChatView />);

    await waitFor(() => {
      expect(screen.getByTestId('message-input')).not.toBeDisabled();
    });

    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'Enter send' } });
    fireEvent.keyDown(screen.getByTestId('message-input'), { key: 'Enter' });

    expect(trackUsage).toHaveBeenCalledWith('messages');
  });

  it('dispatches auth overlay when unauthenticated user tries to send', async () => {
    currentUser = null;
    render(<ChatView />);

    await waitFor(() => {
      expect(screen.getByTestId('message-input')).not.toBeDisabled();
    });

    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'Need auth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SHOW_AUTH_OVERLAY',
      payload: expect.any(Function)
    });
    expect(trackUsage).not.toHaveBeenCalled();
  });

  it('does not send while usage info is still loading', () => {
    getRemainingUsage.mockReturnValue(new Promise(() => {}));
    render(<ChatView />);

    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'Too early' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    fireEvent.keyDown(screen.getByTestId('message-input'), { key: 'Enter' });

    expect(trackUsage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('runs deferred send callback after auth overlay completes', async () => {
    currentUser = null;
    render(<ChatView />);

    await waitFor(() => {
      expect(screen.getByTestId('message-input')).not.toBeDisabled();
    });

    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'After auth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    const authCallback = dispatch.mock.calls[0][0].payload;

    await act(async () => {
      await authCallback();
    });

    await waitFor(() => {
      expect(screen.getByText('After auth')).toBeInTheDocument();
    });
    expect(trackUsage).toHaveBeenCalledWith('messages');
  });
});