import { ActionIcon, Button, Group, Slider, Text, Switch, Tooltip } from '@mantine/core';
import { IconPlayerPlay, IconPlayerStop, IconPlayerRecord, IconMoodCrazyHappy, IconVolume, IconVolumeOff, IconSettings } from '@tabler/icons-react';
import classes from './TransportBar.module.css';

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
            onChange={(event) => onMonoToggle(!event.currentTarget.checked)}
            label={isMono ? "Mono" : "Stereo"}
            labelPosition="right"
          />
          <IconVolume size={18} />
        </Group>

        {onOpenModulationSettings && (
          <ActionIcon
            onClick={onOpenModulationSettings}
            title="Modulation Settings"
            variant="light"
            size="lg"
          >
            <IconSettings size={20} />
          </ActionIcon>
        )}

        <Group className={classes.chaosControl}>
          <Tooltip label="Adjust chaos level - higher values create more extreme modulation">
            <IconMoodCrazyHappy size={24} />
          </Tooltip>
          <Text size="sm">Chaos:</Text>
          <Slider
            value={chaosValue}
            onChange={onChaosChange}
            min={0}
            max={100}
            step={1}
            style={{ width: 150 }}
            label={(value) => { return `${value}%`; }}
            marks={[
              { value: 0, label: '0' },
              { value: 50, label: '50' },
              { value: 100, label: '100' }
            ]}
            color={chaosValue > 50 ? chaosValue > 75 ? 'red' : 'orange' : 'blue'}
          />
        </Group>
      </Group>
    </Group>
  );
}

export default TransportBar;
