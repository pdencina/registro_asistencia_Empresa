import { useEffect } from 'react';
import { POSTS } from './posts';

/**
 * Índice del blog — flexio.cl/blog
 * Lista los artículos. Cada uno posiciona por keywords de alto interés.
 */
export default function BlogIndexPage() {
  useEffect(() => {
    document.title = 'Blog — Flexio | Control de Asistencia, Resolución 38 y Ley 40 horas';
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav simple */}
      <nav className="bg-white border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="text-xl font-extrabold text-slate-900">flex<span className="text-blue-600">io</span></a>
          <a href="/" className="text-sm text-slate-600 hover:text-slate-900">← Volver al inicio</a>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-extrabold text-slate-900">Blog de Flexio</h1>
          <p className="text-slate-500 mt-2">Guías sobre control de asistencia, normativa laboral y gestión de personas en Chile.</p>
        </header>

        <div className="space-y-5">
          {POSTS.map(post => (
            <a key={post.slug} href={`/blog/${post.slug}`}
              className="block bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-md hover:border-blue-200 transition">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">{post.category}</span>
                <span className="text-xs text-slate-400">{post.readTime} de lectura</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-1.5">{post.title}</h2>
              <p className="text-sm text-slate-500">{post.description}</p>
              <span className="inline-block mt-3 text-sm font-semibold text-blue-600">Leer artículo →</span>
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 bg-blue-600 rounded-2xl p-8 text-center text-white">
          <h3 className="text-xl font-bold mb-2">¿Necesitas un sistema de control de asistencia?</h3>
          <p className="text-blue-100 mb-5 text-sm">Plataforma de control de asistencia diseñada según los estándares de la Resolución 38. Desde $1.590 por trabajador. 15 días gratis.</p>
          <a href="https://wa.me/56949616038?text=Hola,%20me%20interesa%20Flexio"
            className="inline-block bg-white text-blue-600 px-6 py-3 rounded-xl font-semibold hover:bg-blue-50 transition">
            Solicitar demo
          </a>
        </div>
      </div>
    </div>
  );
}
