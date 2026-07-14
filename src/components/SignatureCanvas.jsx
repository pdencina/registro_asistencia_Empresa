import { useRef, useState, useEffect, useCallback } from 'react';

export default function SignatureCanvas({ onSign, existingSignature }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#1a2332';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Si ya hay una firma existente, dibujarla
    if (existingSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasSignature(true);
      };
      img.src = existingSignature;
    }
  }, [existingSignature]);

  useEffect(() => {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    return () => window.removeEventListener('resize', setupCanvas);
  }, [setupCanvas]);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDraw() {
    setDrawing(false);
  }

  function clear() {
    setHasSignature(false);
    setupCanvas();
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSign(dataUrl);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Firma del Representante Legal</p>
      <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white relative">
        <canvas
          ref={canvasRef}
          className="w-full h-[180px] cursor-crosshair touch-none block"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 text-sm">Dibuje su firma aquí</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Use el mouse o dedo para firmar</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clear}
            className="text-xs border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-all"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!hasSignature}
            className="text-xs bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirmar firma
          </button>
        </div>
      </div>
    </div>
  );
}
