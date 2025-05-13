import React from 'react';
import { ScrollArea, Paper, Text, List } from '@mantine/core';
import classes from './NodeList.module.css';
import type { AudioNodeInstance } from '../../audio/schema';

interface NodeListProps {
  nodes: AudioNodeInstance[];
}

const NodeList: React.FC<NodeListProps> = ({ nodes }) => {
  return (
    <Paper p="md" shadow="xs" className={classes.nodeListContainer}>
      <Text size="lg" ta="center" mb="sm" className={classes.nodeListTitle}>Current Nodes</Text>
      {nodes.length === 0 ? (
        <Text ta="center" c="dimmed">No nodes in the graph.</Text>
      ) : (
        <ScrollArea h={200}> {/* Mantine ScrollArea for better scrollbars */}
          <List listStyleType="none" spacing="xs" className={classes.list}>
            {nodes.map(node => (
              <List.Item key={node.id} className={classes.listItem}>
                <Text fw={500}>{node.type.toUpperCase()} (ID: {node.id})</Text>
                {Object.keys(node.parameters).length > 0 && (
                  <List listStyleType="disc" withPadding className={classes.nodeParameters}>
                    {Object.entries(node.parameters).map(([paramId, value]) => (
                      <List.Item key={paramId} className={classes.parameterItem}>
                        {paramId}: {String(value)}
                      </List.Item>
                    ))}
                  </List>
                )}
              </List.Item>
            ))}
          </List>
        </ScrollArea>
      )}
    </Paper>
  );
};

export default NodeList;
