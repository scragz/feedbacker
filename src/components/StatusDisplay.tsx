import React from 'react';
import { Paper, Text } from '@mantine/core';
import classes from './StatusDisplay.module.css';

interface StatusDisplayProps {
  audioError: string | null;
  audioInitialized: boolean;
  audioContextState: AudioContextState | null;
  processorReady: boolean;
  initMessageSent: boolean;
}

const StatusDisplay: React.FC<StatusDisplayProps> = ({
  audioError,
  audioInitialized,
  audioContextState,
  processorReady,
  initMessageSent,
}) => {
  let statusMessage = 'Initializing audio system...';
  let statusClass = classes.infoText;

  if (audioError) {
    statusMessage = `Audio Error: ${audioError}`;
    statusClass = classes.errorText;
  } else if (audioInitialized) {
    statusMessage = `Audio system core initialized! Context: ${audioContextState}.`;
    if (processorReady) {
      statusMessage += ' Processor Ready.';
    } else {
      statusMessage += ' Waiting for processor...';
    }
    if (initMessageSent) {
      statusMessage += ' Initial graph sent.';
    }
    statusClass = classes.successText;
  } else if (audioContextState) {
    statusMessage = `Initializing... Context State: ${audioContextState}`;
  }


  return (
    <Paper p="sm" shadow="xs" className={classes.statusDisplayContainer}>
      <Text className={`${classes.statusText} ${statusClass}`}>{statusMessage}</Text>
    </Paper>
  );
};

export default StatusDisplay;
