import { Box, Flex, Group, Select, Slider, Switch, Text, Tooltip } from '@mantine/core';
import { IconWaveSine, IconWaveSquare, IconWaveSawTool } from '@tabler/icons-react';
import type { LFOWaveformType } from '../audio/schema';

interface ModulationPanelProps {
  lfo1: {
    enabled: boolean;
    frequency: number;
    waveform: LFOWaveformType;
    amount: number;
  };
  lfo2: {
    enabled: boolean;
    frequency: number;
    waveform: LFOWaveformType;
    amount: number;
  };
  chaosValue: number;
  onLFOChange: (lfoNumber: 1 | 2, paramName: string, value: number | string | boolean) => void;
  onChaosChange: (value: number) => void;
}

const waveformIcons = {
  sine: <IconWaveSine size={18} />,
  square: <IconWaveSquare size={18} />,
  triangle: <IconWaveSine size={18} stroke={1.5} />,
  sawtooth: <IconWaveSawTool size={18} />,
  random: <IconWaveSquare size={18} stroke={1.5} />
};

export function ModulationPanel({
  lfo1,
  lfo2,
  chaosValue,
  onLFOChange,
  onChaosChange
}: ModulationPanelProps) {
  const waveformOptions = [
    { value: 'sine', label: 'Sine' },
    { value: 'square', label: 'Square' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'sawtooth', label: 'Sawtooth' },
    { value: 'random', label: 'Random' }
  ];

  return (
    <Box p="md" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <Text size="lg" fw={600} mb="md">Modulation Controls</Text>

      <Group mb="md" align="flex-start">
        {/* LFO 1 Controls */}
        <Box style={{ flex: 1, minWidth: '220px' }}>
          <Flex justify="space-between" align="center" mb="xs">
            <Text fw={500}>LFO 1</Text>
            <Switch
              checked={lfo1.enabled}
              onChange={(event) => { onLFOChange(1, 'enabled', event.currentTarget.checked) }}
              label="Enabled"
              labelPosition="left"
            />
          </Flex>

          <Flex mb="xs">
            <Text size="sm" style={{ width: '80px' }}>Waveform:</Text>
            <Select
              size="xs"
              data={waveformOptions}
              value={lfo1.waveform}
              onChange={(value) => { onLFOChange(1, 'waveform', value ?? 'sine') }}
              leftSection={waveformIcons[lfo1.waveform]}
              disabled={!lfo1.enabled}
              style={{ flex: 1 }}
            />
          </Flex>

          <Flex direction="column" mb="xs">
            <Text size="sm">Frequency:</Text>
            <Slider
              min={0.1}
              max={20}
              step={0.1}
              value={lfo1.frequency}
              onChange={(value) => { onLFOChange(1, 'frequency', value ) }}
              label={(value) => `${value.toFixed(1)} Hz`}
              disabled={!lfo1.enabled}
              scale={(val) => Math.log10(val / 0.1) / Math.log10(20 / 0.1) * 100}
            />
          </Flex>

          <Flex direction="column">
            <Text size="sm">Amount:</Text>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={lfo1.amount}
              onChange={(value) => { onLFOChange(1, 'amount', value) }}
              label={(value) => `${Math.round(value * 100)}%`}
              disabled={!lfo1.enabled}
            />
          </Flex>
        </Box>

        {/* LFO 2 Controls */}
        <Box style={{ flex: 1, minWidth: '220px' }}>
          <Flex justify="space-between" align="center" mb="xs">
            <Text fw={500}>LFO 2</Text>
            <Switch
              checked={lfo2.enabled}
              onChange={(event) => { onLFOChange(2, 'enabled', event.currentTarget.checked) }}
              label="Enabled"
              labelPosition="left"
            />
          </Flex>

          <Flex mb="xs">
            <Text size="sm" style={{ width: '80px' }}>Waveform:</Text>
            <Select
              size="xs"
              data={waveformOptions}
              value={lfo2.waveform}
              onChange={(value) => { onLFOChange(2, 'waveform', value ?? 'sine') }}
              leftSection={waveformIcons[lfo2.waveform]}
              disabled={!lfo2.enabled}
              style={{ flex: 1 }}
            />
          </Flex>

          <Flex direction="column" mb="xs">
            <Text size="sm">Frequency:</Text>
            <Slider
              min={0.05}
              max={10}
              step={0.05}
              value={lfo2.frequency}
              onChange={(value) => { onLFOChange(2, 'frequency', value) }}
              label={(value) => `${value.toFixed(2)} Hz`}
              disabled={!lfo2.enabled}
              scale={(val) => Math.log10(val / 0.05) / Math.log10(10 / 0.05) * 100}
            />
          </Flex>

          <Flex direction="column">
            <Text size="sm">Amount:</Text>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={lfo2.amount}
              onChange={(value) => { onLFOChange(2, 'amount', value) }}
              label={(value) => `${Math.round(value * 100)}%`}
              disabled={!lfo2.enabled}
            />
          </Flex>
        </Box>

        {/* Chaos Control */}
        <Box style={{ flex: 1, minWidth: '220px' }}>
          <Tooltip label="Chaos increases modulation intensity and adds randomness">
            <Text fw={500} mb="xs">Chaos Factor</Text>
          </Tooltip>

          <Flex direction="column">
            <Slider
              min={0}
              max={100}
              value={chaosValue}
              onChange={onChaosChange}
              label={(value) => `${value}%`}
              size="lg"
              thumbLabel="Chaos"
              color="red"
              marks={[
                { value: 0, label: 'None' },
                { value: 25, label: 'Mild' },
                { value: 50, label: 'Medium' },
                { value: 75, label: 'High' },
                { value: 100, label: 'Extreme' },
              ]}
            />
          </Flex>
        </Box>
      </Group>
    </Box>
  );
}
