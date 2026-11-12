import { useEffect, useState } from "react";

type Listener = (message: string) => void;

let listener: Listener | null = null;

export function toast(message: string) {
  listener?.(message);
}

interface Item {
  id: number;
  message: string;
}

export function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    listener = (message: string) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev.slice(-2), { id, message }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 2000);
    };
    return () => {
      listener = null;
    };
  }, []);

  return (
    <div className="toast-host" aria-live="polite" aria-atomic="false">
      {items.map((item) => (
        <div className="toast" key={item.id}>
          {item.message}
        </div>
      ))}
    </div>
  );
}
