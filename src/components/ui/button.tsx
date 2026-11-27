import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[14px] font-semibold not-italic transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-bds-brand-600-hover',
        destructive:
          'bg-destructive text-bds-static-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        success:
          'bg-success text-bds-static-white shadow-xs hover:bg-success/90 focus-visible:ring-success/20 dark:focus-visible:ring-success/40',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary: 'border border-border bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
        /** Иконка тулбара: muted → brand. `data-tone="muted"` — BDS gray-t3 → brand-700. */
        icon:
          'bg-transparent text-bds-non-vip shadow-none hover:bg-transparent hover:text-bds-static-white aria-pressed:text-bds-brand-700-normal aria-pressed:hover:text-tmp-ffc35c data-[active=true]:text-bds-brand-700-normal data-[active=true]:hover:text-tmp-ffc35c data-[tone=muted]:text-bds-gray-t3 data-[tone=muted]:hover:bg-transparent data-[tone=muted]:hover:text-bds-brand-700-normal',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: 'h-5 rounded text-[11px] gap-1.5 px-2 has-[>svg]:px-2.5',
        /** Компактная кнопка (32px), текст 12px — шапка, тулбары */
        sm: "h-8 gap-1.5 rounded-md px-3 text-[12px] has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        /** Компактная иконка (h-8), под SVG size-4 */
        'icon-sm': "size-8 rounded [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(function Button({ className, variant, size, asChild = false, ...props }, ref) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { Button, buttonVariants };
