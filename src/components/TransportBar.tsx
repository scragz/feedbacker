import { ActionIcon, Button, Group, Text, Tooltip } from '@mantine/core';
import { IconPlayerPlay, IconPlayerStop, IconPlayerRecord, IconMoodCrazyHappy, IconVolume, IconVolumeOff } from '@tabler/icons-react';
import classes from './TransportBar.module.css';
import { Knob } from './InputControls/Knob';
import { Switch } from './InputControls/Switch';

interface TransportBarProps {
  audioContextState: AudioContextState | null;
  onPlayPause: () => void;
  onRecord: () => void;
  chaosValue: number;
  onChaosChange: (value: number) => void;
  isMono: boolean;
  onMonoToggle: (value: boolean) => void;
  isRecording?: boolean;
  onOpenModulationSettings?: () => void;
}

export function TransportBar({
  audioContextState,
  onPlayPause,
  onRecord,
  chaosValue,
  onChaosChange,
  isMono,
  onMonoToggle,
  isRecording = false,
  onOpenModulationSettings,
}: TransportBarProps) {
  const isPlaying = audioContextState === 'running';

  // Get color for chaos knob based on value
  const getChaosColor = (value: number) => {
    if (value > 75) return '#f55';
    if (value > 50) return '#f95';
    return '#5af';
  };

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

      <Group>
        <Group className={classes.monoControl}>
          <IconVolumeOff size={18} />
          <Switch
            checked={!isMono}
            onChange={(checked) => { onMonoToggle(!checked) }}
            label={isMono ? "Mono" : "Stereo"}
            className={classes.stereoSwitch}
          />
          <IconVolume size={18} />
        </Group>

        {onOpenModulationSettings && (
          <Button
            onClick={onOpenModulationSettings}
            variant="subtle"
            size="sm"
            leftSection={<IconMoodCrazyHappy size={18} />}
          >
            Advanced Modulation
          </Button>
        )}

        <Group className={classes.chaosControl}>
          <Tooltip label="Adjust chaos level - higher values create more extreme modulation">
            <IconMoodCrazyHappy size={24} />
          </Tooltip>
          <Text size="sm">Chaos:</Text>
          <div className={classes.chaosKnob}>
            <Knob
              min={0}
              max={100}
              step={1}
              value={chaosValue}
              onChange={onChaosChange}
              color={getChaosColor(chaosValue)}
              bgcolor="#222"
              variant="medium"
              label={`${chaosValue}%`}
            />
          </div>
        </Group>
      </Group>
    </Group>
  );
}

export default TransportBar;
