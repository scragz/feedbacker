import { Box, Select, Text, Tooltip } from '@mantine/core';
import { IconWaveSine, IconWaveSquare, IconWaveSawTool } from '@tabler/icons-react';
import type { LFOWaveformType } from '../audio/schema';
import { Slider } from './Controls/Slider';
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
  const getChaosColor = (value: number): string => {
    if (value > 75) return 'red';
    if (value > 50) return 'orange';
    return 'mfnCyan';
  };

  return (
    <Box p="md" className={classes.container}>
      <Box className={classes.chaosContainer}>
        <div className={classes.chaosKnob}>
          <Slider
            min={0}
            max={100}
            step={1}
            value={chaosValue}
            onChange={onChaosChange}
            color={getChaosColor(chaosValue)}
            showLabel={false}
            showValue={true}
            formatDisplayValue={(value) => `${value}%`}
            marks={[
              { value: 0, label: 'None' },
              { value: 25, label: 'Mild' },
              { value: 50, label: 'Med' },
              { value: 75, label: 'High' },
              { value: 100, label: 'X' }
            ]}
            size="lg"
          />
        </div>
        <div className={classes.chaosLabelContainer}>
          <Tooltip label="Chaos increases modulation intensity and adds randomness">
            <Text className={classes.modulationTitle}>Chaos</Text>
          </Tooltip>
        </div>
      </Box>

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
              <Slider
                min={-1}
                max={1}
                step={0.01}
                value={lfo1.amount}
                onChange={(value) => { onLFOChange(1, 'amount', value) }}
                color="mfnCyan"
                disabled={!lfo1.enabled}
                formatDisplayValue={(value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`}
                label="Amount"
                variant="modulation"
              />
            </div>
          </div>

          <div className={classes.knobsRow}>
            <div className={classes.knobColumn}>
              <Slider
                min={1}
                max={10000}
                step={1}
                value={lfo1.frequency}
                onChange={(value) => { onLFOChange(1, 'frequency', value) }}
                color="mfnCyan"
                disabled={!lfo1.enabled}
                formatDisplayValue={(value) => `${value.toFixed(1)} Hz`}
                label="Frequency"
                variant="parameter"
              />
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
              <Slider
                min={-1}
                max={1}
                step={0.01}
                value={lfo2.amount}
                onChange={(value) => { onLFOChange(2, 'amount', value) }}
                color="mfnCyan"
                disabled={!lfo2.enabled}
                formatDisplayValue={(value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`}
                label="Amount"
                variant="modulation"
              />
            </div>
          </div>

          <div className={classes.knobsRow}>
            <div className={classes.knobColumn}>
              <Slider
                min={1}
                max={10000}
                step={1}
                value={lfo2.frequency}
                onChange={(value) => { onLFOChange(2, 'frequency', value) }}
                color="mfnCyan"
                disabled={!lfo2.enabled}
                formatDisplayValue={(value) => `${value.toFixed(2)} Hz`}
                label="Frequency"
                variant="parameter"
              />
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

          <div className={classes.singleKnobRow}>
            <div style={{ width: '100%' }}>
              <Slider
                min={-1}
                max={1}
                step={0.01}
                value={env1.amount}
                onChange={(value) => { onEnvChange(1, 'amount', value) }}
                color="mfnCyan"
                disabled={!env1.enabled}
                formatDisplayValue={(value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`}
                label="Amount"
                variant="modulation"
              />
            </div>
          </div>

          <div className={classes.knobsRow}>
            <div className={classes.knobColumn}>
              <Slider
                min={0.001}
                max={1}
                step={0.001}
                value={env1.attack}
                onChange={(value) => { onEnvChange(1, 'attack', value) }}
                color="mfnCyan"
                disabled={!env1.enabled}
                formatDisplayValue={(value) => `${(value * 1000).toFixed(0)} ms`}
                label="Attack"
                variant="parameter"
              />
            </div>

            <div className={classes.knobColumn}>
              <Slider
                min={0.001}
                max={2}
                step={0.001}
                value={env1.release}
                onChange={(value) => { onEnvChange(1, 'release', value) }}
                color="mfnCyan"
                disabled={!env1.enabled}
                formatDisplayValue={(value) => `${(value * 1000).toFixed(0)} ms`}
                label="Release"
                variant="parameter"
              />
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

          <div className={classes.singleKnobRow}>
            <div style={{ width: '100%' }}>
              <Slider
                min={-1}
                max={1}
                step={0.01}
                value={env2.amount}
                onChange={(value) => { onEnvChange(2, 'amount', value) }}
                color="mfnCyan"
                disabled={!env2.enabled}
                formatDisplayValue={(value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`}
                label="Amount"
                variant="modulation"
              />
            </div>
          </div>

          <div className={classes.knobsRow}>
            <div className={classes.knobColumn}>
              <Slider
                min={0.001}
                max={1}
                step={0.001}
                value={env2.attack}
                onChange={(value) => { onEnvChange(2, 'attack', value) }}
                color="mfnCyan"
                disabled={!env2.enabled}
                formatDisplayValue={(value) => `${(value * 1000).toFixed(0)} ms`}
                label="Attack"
                variant="parameter"
              />
            </div>

            <div className={classes.knobColumn}>
              <Slider
                min={0.001}
                max={2}
                step={0.001}
                value={env2.release}
                onChange={(value) => { onEnvChange(2, 'release', value) }}
                color="mfnCyan"
                disabled={!env2.enabled}
                formatDisplayValue={(value) => `${(value * 1000).toFixed(0)} ms`}
                label="Release"
                variant="parameter"
              />
            </div>
          </div>
        </Box>
      </div>
    </Box>
  );
}
