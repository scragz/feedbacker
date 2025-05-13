import React from 'react';
import { Title } from '@mantine/core';
import classes from './Header.module.css';

const Header: React.FC = () => {
  return (
    <Title className={classes.header}>
      Feedbacker
    </Title>
  );
};

export default Header;
