import AuthForm from '../components/auth/AuthForm';
import { useAuth } from '../auth/AuthContext';

export default function Register() {
  const { register } = useAuth();
  return (
    <AuthForm
      mode="register"
      onSubmit={({ email, password, display_name }) =>
        register({ email, password, display_name: display_name || undefined })
      }
    />
  );
}
