import { createTheme } from '@mantine/core';
import type { MantineColorsTuple } from '@mantine/core';

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
  fontFamily: "'Space Grotesk', sans-serif",
  fontFamilyMonospace: "'VT323', monospace",
  primaryColor: 'mfnCyan',
  colors: {
    mfnCyan,
    mfnOrange,
  },
  headings: {
    fontFamily: "Space Grotesk, sans-serif",
    sizes: {
      h1: {
        fontWeight: '100',
        fontSize: '3rem',
        lineHeight: '1.4',
      },
    },
  }
});
