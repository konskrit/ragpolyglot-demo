import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

type ButtonAppearance = {
  variant?: Variant;
  size?: Size;
  className?: string;
};

const BASE =
  'inline-flex items-center justify-center rounded-lg font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed';

const variantClass: Record<Variant, string> = {
  primary:
    'bg-indigo-600 text-white border border-indigo-500/50 hover:bg-indigo-500',
  secondary:
    'bg-gray-800 text-gray-100 border border-gray-600 hover:border-gray-500 hover:bg-gray-700',
  danger: 'bg-red-600/90 text-white border border-red-500/40 hover:bg-red-500',
  ghost:
    'bg-gray-800/60 text-gray-300 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 hover:text-white',
};

const sizeClass: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
};

function buttonClasses({
  variant = 'primary',
  size = 'md',
  className = '',
}: ButtonAppearance): string {
  return `${BASE} ${variantClass[variant]} ${sizeClass[size]} ${className}`.trim();
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonAppearance) {
  return (
    <button
      type="button"
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  children,
  ...props
}: LinkProps & ButtonAppearance) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
