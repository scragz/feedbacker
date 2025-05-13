import { ActionIcon, Button, Group, Slider, Text } from '@mantine/core';
import { IconPlayerPlay, IconPlayerStop, IconPlayerRecord, IconMoodCrazyHappy } from '@tabler/icons-react';
import classes from './TransportBar.module.css';

interface TransportBarProps {
  audioContextState: AudioContextState | null;
  onPlayPause: () => void;
  onRecord: () => void; // Placeholder for now
  chaosValue: number;
  onChaosChange: (value: number) => void; // Placeholder for now
  isRecording?: boolean; // Optional: to change record button appearance
}

export function TransportBar({
  audioContextState,
  onPlayPause,
  onRecord,
  chaosValue,
  onChaosChange,
  isRecording = false,
}: TransportBarProps) {
  const isPlaying = audioContextState === 'running';

  return (
    <Group className={classes.transportBar} justify="space-between" p="xs">
      <Group>
        <ActionIcon onClick={onPlayPause} size="lg" aria-label={isPlaying ? 'Stop' : 'Play'}>
          {isPlaying ? <IconPlayerStop size={24} /> : <IconPlayerPlay size={24} />}
        </ActionIcon>
        <Button
          leftSection={<IconPlayerRecord size={18} />}
          onClick={onRecord}
          variant={isRecording ? 'filled' : 'outline'}
          color={isRecording ? 'red' : 'gray'}
        >
          Record
        </Button>
      </Group>
      <Group className={classes.chaosControl}>
        <IconMoodCrazyHappy size={24} />
        <Text size="sm">Chaos:</Text>
        <Slider
          value={chaosValue}
          onChange={onChaosChange}
          min={0}
          max={100}
          step={1}
          style={{ width: 150 }}
          label={(value) => `${value}%`}
        />
      </Group>
    </Group>
  );
}

export default TransportBar;
