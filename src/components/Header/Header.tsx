import React from 'react';
import { Title } from '@mantine/core';
import classes from './Header.module.css';

interface HeaderProps {
  title: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  return (
    <Title order={3} className={classes.header}>
      {title}
    </Title>
  );
};

export default Header;
