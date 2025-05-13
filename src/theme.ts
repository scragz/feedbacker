import { createTheme, MantineColorsTuple } from '@mantine/core';

// Example custom colors - replace with your actual cyan and orange
const mfnCyan: MantineColorsTuple = [
  '#e0ffff',
  '#ccfbfb',
  '#9af5f5',
  '#62efef',
  '#39e9e9',
  '#25e5e5',
  '#19e3e3',
  '#09c9c9',
  '#00b4b4',
  '#009d9d',
];

const mfnOrange: MantineColorsTuple = [
  '#fff0e0',
  '#ffdfcc',
  '#ffc999',
  '#ffb060',
  '#ff9a33',
  '#ff8c1a',
  '#ff820a',
  '#e66f00',
  '#cc6200',
  '#b35400',
];

export const theme = createTheme({
  /** Put your mantine theme override here */
  primaryColor: 'mfnCyan', // Will be one of the keys in colors
  defaultColorScheme: 'dark',
  colors: {
    mfnCyan,
    mfnOrange,
  },
  // Other theme properties
  // fontFamily: 'Verdana, sans-serif',
  // headings: { fontFamily: 'Greycliff CF, sans-serif' },
});
