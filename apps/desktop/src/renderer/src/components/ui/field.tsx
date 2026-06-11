import * as React from 'react';
import { Label } from './label';

export function Field({
  id,
  label,
  description,
  descriptionId,
  className = '',
  children,
}: {
  id?: string;
  label: string;
  description?: string;
  descriptionId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const fallbackId = React.useId();
  const labelId = id ? `${id}-label` : `${fallbackId}-label`;
  const resolvedDescriptionId =
    descriptionId || (id && description ? `${id}-description` : undefined);

  return (
    <div className={`grid gap-2 ${className}`}>
      <div className="field-copy">
        <Label htmlFor={id} id={labelId}>
          {label}
        </Label>
        {description ? <p id={resolvedDescriptionId}>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
