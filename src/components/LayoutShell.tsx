import { AppShell } from '@mantine/core';
import Header from './Header';
import classes from './LayoutShell.module.css';

interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({
  children,
}: LayoutShellProps) {
  return (
    <AppShell className={classes.shell}>
      <AppShell.Header className={classes.header}>
        <Header title="Feedbacker" />
      </AppShell.Header>
      <AppShell.Main className={classes.main}>{children}</AppShell.Main>
    </AppShell>
  );
}

export default LayoutShell;
