import { AppShell } from '@mantine/core';
import React from 'react';
import Header from '../Header/Header';
import classes from './LayoutShell.module.css';

interface LayoutShellProps {
  children: React.ReactNode;
}

export default function LayoutShell({ children }: LayoutShellProps) {
  return (
    <AppShell
      className={classes.shell}
    >
      <AppShell.Header className={classes.header}>
        <Header />
      </AppShell.Header>

      <AppShell.Main className={classes.main}>{children}</AppShell.Main>
    </AppShell>
  );
}
