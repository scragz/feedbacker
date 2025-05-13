import { AppShell, Group } from '@mantine/core';
import React from 'react';
import Header from '../Header/Header';
import classes from './LayoutShell.module.css';

interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps) {
  return (
    <AppShell
      className={classes.shell}
    >
      <AppShell.Header className={classes.header}>
        <Group h="100%" px="md">
          <Header />
        </Group>
      </AppShell.Header>

      <AppShell.Main className={classes.main}>{children}</AppShell.Main>
    </AppShell>
  );
}
