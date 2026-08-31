export interface ButtonProps {
  label: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ label, onClick, type = 'button', variant = 'primary' }: ButtonProps) {
  return {
    type,
    variant,
    label,
    onClick
  };
}
