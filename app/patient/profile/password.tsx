import { useApiData } from '@/lib/useApiData';
import { PatientProfile } from '@/lib/types';
import { LoadingView } from '@/components/ui';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';

export default function PatientPasswordScreen() {
  // Patients who only ever used OTP/QR have no password yet, so "current" is optional for them.
  const { data, loading } = useApiData<PatientProfile>('/api/patients/me');
  if (loading) return <LoadingView />;
  return <ChangePasswordForm endpoint="/api/patients/me/change-password" requireCurrent={data?.hasPassword !== false} />;
}
