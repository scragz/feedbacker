import { Box, Select, Text, Tooltip, Flex, Group, Stack } from '@mantine/core';
import { IconWaveSine, IconWaveSquare, IconWaveSawTool } from '@tabler/icons-react';
import type { LFOWaveformType } from '../audio/schema';
import { Knob } from './Controls/Knob';
import { Switch } from './Controls/Switch';
import classes from './ModulationPanel.module.css';

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
  env1?: {
    enabled: boolean;
    attack: number;
    release: number;
    amount: number;
    source: string | null;
  };
  env2?: {
    enabled: boolean;
    attack: number;
    release: number;
    amount: number;
    source: string | null;
  };
  chaosValue: number;
  availableNodeIds?: { id: string; label: string }[];
  onLFOChange: (lfoNumber: 1 | 2, paramName: string, value: number | string | boolean) => void;
  onEnvChange?: (envNumber: 1 | 2, paramName: string, value: number | string | boolean | null) => void;
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
  env1 = {
    enabled: false,
    attack: 0.01,
    release: 0.1,
    amount: 0,
    source: null
  },
  env2 = {
    enabled: false,
    attack: 0.05,
    release: 0.5,
    amount: 0,
    source: null
  },
  chaosValue,
  availableNodeIds = [],
  onLFOChange,
  onEnvChange = () => null,
  onChaosChange
}: ModulationPanelProps) {
  const waveformOptions = [
    { value: 'sine', label: 'Sine' },
    { value: 'square', label: 'Square' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'sawtooth', label: 'Sawtooth' },
    { value: 'random', label: 'Random' }
  ];

  // Get color based on value for chaos knob
  const getChaosColor = (value: number) => {
    if (value > 75) return '#f55';
    if (value > 50) return '#f95';
    return '#5af';
  };

  return (
    <Box p="md" className={classes.container}>
      <Text size="lg" fw={600} mb="md">Modulation Controls</Text>

      <div className={classes.flexGroup}>
        {/* LFO 1 Controls */}
        <Box className={classes.lfoSection}>
          <div className={classes.headerRow}>
            <Text fw={500}>LFO 1</Text>
            <Switch
              checked={lfo1.enabled}
              onChange={(checked) => { onLFOChange(1, 'enabled', checked) }}
              variant="led"
            />
          </div>

          <div className={classes.selectRow}>
            <Select
              size="xs"
              data={waveformOptions}
              value={lfo1.waveform}
              onChange={(value) => { onLFOChange(1, 'waveform', value ?? 'sine') }}
              leftSection={waveformIcons[lfo1.waveform]}
              disabled={!lfo1.enabled}
              styles={{ root: { width: '100%' } }}
            />
          </div>

          <div className={classes.knobsRow}>
            <div className={classes.knobColumn}>
              <Knob
                min={0.1}
                max={20}
                step={0.1}
                value={lfo1.frequency}
                onChange={(value) => { onLFOChange(1, 'frequency', value) }}
                color="#5af"
                bgcolor="#222"
                variant="small"
                label={(value) => `${value.toFixed(1)} Hz`}
              />
              <Text className={classes.labelText}>Frequency</Text>
            </div>

            <div className={classes.knobColumn}>
              <Knob
                min={-1}
                max={1}
                step={0.01}
                value={lfo1.amount}
                onChange={(value) => { onLFOChange(1, 'amount', value) }}
                color={lfo1.amount >= 0 ? "#5af" : "#f5a"}
                bgcolor="#222"
                variant="small"
                label={(value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`}
              />
              <Text className={classes.labelText}>Amount</Text>
              <Text className={classes.dimmedText}>+ up / - down</Text>
            </div>
          </div>
        </Box>

        {/* LFO 2 Controls */}
        <Box className={classes.lfoSection}>
          <div className={classes.headerRow}>
            <Text fw={500}>LFO 2</Text>
            <Switch
              checked={lfo2.enabled}
              onChange={(checked) => { onLFOChange(2, 'enabled', checked) }}
            />
          </div>

          <div className={classes.selectRow}>
            <Select
              size="xs"
              data={waveformOptions}
              value={lfo2.waveform}
              onChange={(value) => { onLFOChange(2, 'waveform', value ?? 'sine') }}
              leftSection={waveformIcons[lfo2.waveform]}
              disabled={!lfo2.enabled}
              styles={{ root: { width: '100%' } }}
            />
          </div>

          <div className={classes.knobsRow}>
            <div className={classes.knobColumn}>
              <Knob
                min={0.05}
                max={10}
                step={0.05}
                value={lfo2.frequency}
                onChange={(value) => { onLFOChange(2, 'frequency', value) }}
                color="#5af"
                bgcolor="#222"
                variant="small"
                label={(value) => `${value.toFixed(2)} Hz`}
              />
              <Text className={classes.labelText}>Frequency</Text>
            </div>

            <div className={classes.knobColumn}>
              <Knob
                min={-1}
                max={1}
                step={0.01}
                value={lfo2.amount}
                onChange={(value) => { onLFOChange(2, 'amount', value) }}
                color={lfo2.amount >= 0 ? "#5af" : "#f5a"}
                bgcolor="#222"
                variant="small"
                label={(value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`}
              />
              <Text className={classes.labelText}>Amount</Text>
              <Text className={classes.dimmedText}>+ up / - down</Text>
            </div>
          </div>
        </Box>

        {/* Envelope Follower 1 Controls */}
        <Box className={classes.lfoSection}>
          <div className={classes.headerRow}>
            <Text fw={500}>ENV 1</Text>
            <Switch
              checked={env1.enabled}
              onChange={(checked) => { onEnvChange(1, 'enabled', checked) }}
            />
          </div>

          <div className={classes.selectRow}>
            <Select
              size="xs"
              data={[{value: 'none', label: 'None'}, ...availableNodeIds.map(node => ({
                value: node.id,
                label: node.label || node.id
              }))]}
              value={env1.source ?? 'none'}
              onChange={(value) => { onEnvChange(1, 'source', value === 'none' ? null : value) }}
              disabled={!env1.enabled}
              styles={{ root: { width: '100%' } }}
            />
          </div>

          <div className={classes.knobsRow}>
            <div className={classes.knobColumn}>
              <Knob
                min={0.001}
                max={1}
                step={0.001}
                value={env1.attack}
                onChange={(value) => { onEnvChange(1, 'attack', value) }}
                color="#5af"
                bgcolor="#222"
                variant="small"
                label={(value) => `${(value * 1000).toFixed(0)} ms`}
              />
              <Text className={classes.labelText}>Attack</Text>
            </div>

            <div className={classes.knobColumn}>
              <Knob
                min={0.001}
                max={2}
                step={0.001}
                value={env1.release}
                onChange={(value) => { onEnvChange(1, 'release', value) }}
                color="#5af"
                bgcolor="#222"
                variant="small"
                label={(value) => `${(value * 1000).toFixed(0)} ms`}
              />
              <Text className={classes.labelText}>Release</Text>
            </div>
          </div>

          <div className={classes.singleKnobRow}>
            <div>
              <Knob
                min={-1}
                max={1}
                step={0.01}
                value={env1.amount}
                onChange={(value) => { onEnvChange(1, 'amount', value) }}
                color={env1.amount >= 0 ? "#5af" : "#f5a"}
                bgcolor="#222"
                variant="small"
                label={(value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`}
              />
              <Text className={classes.labelText}>Amount</Text>
              <Text className={classes.dimmedText}>+ up / - down</Text>
            </div>
          </div>
        </Box>

        {/* Envelope Follower 2 Controls */}
        <Box className={classes.lfoSection}>
          <div className={classes.headerRow}>
            <Text fw={500}>ENV 2</Text>
            <Switch
              checked={env2.enabled}
              onChange={(checked) => { onEnvChange(2, 'enabled', checked) }}
            />
          </div>

          <div className={classes.selectRow}>
            <Select
              size="xs"
              data={[{value: 'none', label: 'None'}, ...availableNodeIds.map(node => ({
                value: node.id,
                label: node.label || node.id
              }))]}
              value={env2.source ?? 'none'}
              onChange={(value) => { onEnvChange(2, 'source', value === 'none' ? null : value) }}
              disabled={!env2.enabled}
              styles={{ root: { width: '100%' } }}
            />
          </div>

          <div className={classes.knobsRow}>
            <div className={classes.knobColumn}>
              <Knob
                min={0.001}
                max={1}
                step={0.001}
                value={env2.attack}
                onChange={(value) => { onEnvChange(2, 'attack', value) }}
                color="#5af"
                bgcolor="#222"
                variant="small"
                label={(value) => `${(value * 1000).toFixed(0)} ms`}
              />
              <Text className={classes.labelText}>Attack</Text>
            </div>

            <div className={classes.knobColumn}>
              <Knob
                min={0.001}
                max={2}
                step={0.001}
                value={env2.release}
                onChange={(value) => { onEnvChange(2, 'release', value) }}
                color="#5af"
                bgcolor="#222"
                variant="small"
                label={(value) => `${(value * 1000).toFixed(0)} ms`}
              />
              <Text className={classes.labelText}>Release</Text>
            </div>
          </div>

          <div className={classes.singleKnobRow}>
            <div>
              <Knob
                min={-1}
                max={1}
                step={0.01}
                value={env2.amount}
                onChange={(value) => { onEnvChange(2, 'amount', value) }}
                color={env2.amount >= 0 ? "#5af" : "#f5a"}
                bgcolor="#222"
                variant="small"
                label={(value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`}
              />
              <Text className={classes.labelText}>Amount</Text>
              <Text className={classes.dimmedText}>+ up / - down</Text>
            </div>
          </div>
        </Box>

        {/* Chaos Control */}
        <Box className={classes.chaosSection}>
          <Tooltip label="Chaos increases modulation intensity and adds randomness">
            <Text fw={500} className={classes.modulationTitle}>Chaos</Text>
          </Tooltip>

          <div className={classes.chaosKnob}>
            <Knob
              min={0}
              max={100}
              step={1}
              value={chaosValue}
              onChange={onChaosChange}
              color={getChaosColor(chaosValue)}
              bgcolor="#222"
              variant="small"
              label={(value) => `${value}%`}
            />
          </div>

          <div className={classes.chaosLabels}>
            <Text>None</Text>
            <Text>Mild</Text>
            <Text>Med</Text>
            <Text>High</Text>
            <Text>X</Text>
          </div>
        </Box>
      </div>
    </Box>
  );
}
