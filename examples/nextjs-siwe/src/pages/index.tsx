import { ConnectKitButton, useSIWE } from 'biscotti-finance-connectkit';

export default function Home({ address }: { address?: string }) {
  const { data, isSignedIn, signOut, signIn } = useSIWE();
  console.log({ data, isSignedIn, signOut, signIn });
  return (
    <div className="flex items-center justify-center min-h-screen py-2">
      <ConnectKitButton />
    </div>
  );
}
