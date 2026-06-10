import AuthForm from '../components/auth/AuthForm';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login } = useAuth();
  return (
    <AuthForm
      mode="login"
      onSubmit={({ email, password }) => login({ email, password })}
    />
  );
}
