import { Button, Group } from '@mantine/core';
import { IconMoodCrazyHappy } from '@tabler/icons-react';
import classes from './TransportBar.module.css';
import { Switch } from './Controls/Switch';

interface TransportBarProps {
  audioContextState: AudioContextState | null;
  onPlayPause: () => void;
  onRecord: () => void;
  isMono: boolean;
  onMonoToggle: (value: boolean) => void;
  isRecording?: boolean;
  onOpenModulationSettings?: () => void;
}

export function TransportBar({
  audioContextState,
  onPlayPause,
  onRecord,
  isMono,
  onMonoToggle,
  isRecording = false,
  onOpenModulationSettings,
}: TransportBarProps) {
  const isPlaying = audioContextState === 'running';

  return (
    <Group className={classes.transportBar} justify="space-between" p="xs">
      <Group>
        <div style={{ marginRight: '10px' }}>
          <Switch
            checked={isPlaying}
            onChange={() => { onPlayPause(); }}
            variant="granite"
            label={"Power"}
          />
        </div>
        <div>
          <Switch
            checked={isRecording}
            onChange={() => { onRecord(); }}
            variant="granite"
            label="Record"
          />
        </div>
      </Group>

      <Group>
        <Group className={classes.monoControl}>
          <Switch
            checked={!isMono}
            onChange={(checked) => { onMonoToggle(!checked) }}
            label={isMono ? "Mono" : "Stereo"}
            className={classes.stereoSwitch}
          />
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
      </Group>
    </Group>
  );
}

export default TransportBar;
