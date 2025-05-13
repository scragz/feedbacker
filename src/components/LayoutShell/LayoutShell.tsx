import { Stack, Box } from '@mantine/core';
import classes from './LayoutShell.module.css';

interface LayoutShellProps {
  appHeader: React.ReactNode;
  transportBar: React.ReactNode;
  children: React.ReactNode; // Main content will go here
}

export function LayoutShell({
  appHeader,
  transportBar,
  children,
}: LayoutShellProps) {
  return (
    <Stack gap={0} style={{ height: '100vh' }}>
      <Box className={classes.appHeaderContainer}>{appHeader}</Box>
      <Box className={classes.transportBarContainer}>{transportBar}</Box>
      <Box className={classes.mainContentArea}>{children}</Box>
    </Stack>
  );
}

export default LayoutShell;
