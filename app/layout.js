import './globals.css';

export const metadata = {
  title: 'George Lyu — Personal site',
  description: 'The personal homepage of George Lyu — reader, gamer, and flautist.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
