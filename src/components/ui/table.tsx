import * as React from 'react';

import { cn } from '@/lib/utils';

function Table({ className, wrapperClassName, ...props }: React.ComponentProps<'table'> & { wrapperClassName?: string }) {
  return (
    <div data-slot="table-container" className={cn('relative w-full overflow-x-auto', wrapperClassName)}>
      <table data-slot="table" className={cn('w-full caption-bottom text-sm rounded overflow-hidden', className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b [&_tr]:border-[color:var(--table-row-border-color)]', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t border-[color:var(--table-row-border-color)] font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'h-[27px] border-b border-[color:var(--table-row-border-color)] transition-colors',
        /** Подсветка при наведении совпадает с типичным выделением строки (`bg-accent/40`). */
        'hover:bg-accent/40',
        'data-[state=selected]:bg-accent/40',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  const clickable = typeof props.onClick === 'function';
  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-text-secondary h-6 text-[12px] px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        /** Кликабельный заголовок (onClick на th или кнопка сортировки внутри). */
        '[&_button]:cursor-pointer',
        clickable && 'cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-2 py-1 text-[12px] align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return <caption data-slot="table-caption" className={cn('text-muted-foreground mt-4 text-sm', className)} {...props} />;
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
