import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ErrorBanner from '../common/ErrorBanner';

export interface AuthFormValues {
  email: string;
  password: string;
  display_name: string;
}

interface AuthFormProps {
  mode: 'login' | 'register';
  onSubmit: (values: AuthFormValues) => Promise<void>;
}

// Shared submit/redirect logic for Login and Register. On success the user is
// sent back to wherever RequireAuth bounced them from (default: My Account).
export default function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/account';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ email, password, display_name: displayName });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'input-field input-field-gold';

  return (
    <div className="max-w-sm mx-auto mt-8 space-y-4">
      <h2 className="text-2xl font-bold text-md-gold">
        {mode === 'login' ? 'Sign In' : 'Create Account'}
      </h2>
      {error && <ErrorBanner message={error} />}
      <form onSubmit={handleSubmit} className="bg-md-surface border border-md-border rounded-lg p-4 space-y-3">
        {mode === 'register' && (
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            autoComplete="nickname"
            maxLength={50}
            className={inputClass}
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          required
          className={inputClass}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'register' ? 'Password (min 8 characters)' : 'Password'}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          required
          minLength={mode === 'register' ? 8 : undefined}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-md-gold/15 text-md-gold border border-md-gold/40 hover:bg-md-gold/25 font-bold rounded-lg px-3 py-2 text-sm disabled:opacity-40"
        >
          {submitting ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Register'}
        </button>
      </form>
      <p className="text-xs text-md-textMuted text-center">
        {mode === 'login' ? (
          <>No account? <Link to="/register" className="text-md-blue hover:underline">Register</Link></>
        ) : (
          <>Already registered? <Link to="/login" className="text-md-blue hover:underline">Sign in</Link></>
        )}
      </p>
    </div>
  );
}
