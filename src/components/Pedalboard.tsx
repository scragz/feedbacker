import React from 'react';
import { Stack } from '@mantine/core';
import classes from './Pedalboard.module.css';

interface PedalboardProps {
  children?: React.ReactNode; // Make children optional
}

const Pedalboard: React.FC<PedalboardProps> = ({ children, ...props }) => {
  return (
    <Stack className={classes.pedalboard} {...props}>
      {children} {/* Render children if provided */}
    </Stack>
  );
};

export default Pedalboard;
