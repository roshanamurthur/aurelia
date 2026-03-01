interface ErrorBannerProps {
  message: string;
}

export default function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
      {message}
    </div>
  );
}
