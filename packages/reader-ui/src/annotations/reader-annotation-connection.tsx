import React from 'react';
import type { ActiveConnection } from '../reader-types';

export function AnnotationConnection({ connection }: { connection: ActiveConnection }) {
  const markerId = React.useId().replace(/:/g, '');
  return (
    <svg className="reader-annotation-connection" aria-hidden="true">
      <defs>
        <marker
          id={markerId}
          markerHeight="14"
          markerUnits="userSpaceOnUse"
          markerWidth="14"
          orient="auto"
          refX="10"
          refY="7"
          viewBox="0 0 12 14"
        >
          <path
            className="reader-annotation-arrowhead"
            d="M1.2 2.2 C4.3 4 7 6.1 10 7 M10 7 C6.8 7.6 4.2 9.2 1.3 11.8"
            style={{ stroke: connection.color }}
          />
        </marker>
      </defs>
      <path
        className="reader-annotation-connection-line"
        d={connection.path}
        markerEnd={`url(#${markerId})`}
        style={{ stroke: connection.color }}
      />
    </svg>
  );
}
