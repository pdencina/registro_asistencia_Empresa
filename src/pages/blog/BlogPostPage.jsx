import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPost, POSTS } from './posts';

/**
 * Artículo individual del blog — flexio.cl/blog/:slug
 * Actualiza título y meta description dinámicamente para SEO.
 */
export default function BlogPostPage() {
  const { slug } = useParams();
  const post = getPost(slug);

  useEffect(() => {
    if (post) {
      document.title = `${post.title} | Flexio`;
      // Actualizar meta description
      let meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', post.description);
      // Actualizar canonical
      let canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute('href', `https://flexio.cl/blog/${post.slug}`);
    }
  }, [post]);

  if (!post) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold text-slate-700 mb-2">Artículo no encontrado</h1>
        <a href="/blog" className="text-blue-600 font-semibold">← Ver todos los artículos</a>
      </div>
    );
  }

  const otherPosts = POSTS.filter(p => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="text-xl font-extrabold text-slate-900">flex<span className="text-blue-600">io</span></a>
          <a href="/blog" className="text-sm text-slate-600 hover:text-slate-900">← Blog</a>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">{post.category}</span>
          <span className="text-xs text-slate-400">{post.readTime} de lectura</span>
        </div>

        <h1 className="text-3xl font-extrabold text-slate-900 leading-tight mb-8">{post.title}</h1>

        <div className="prose prose-slate max-w-none">
          {post.sections.map((s, i) => (
            <div key={i} className="mb-6">
              {s.h && <h2 className="text-xl font-bold text-slate-900 mb-3">{s.h}</h2>}
              {s.p && <p className="text-slate-700 leading-relaxed">{s.p}</p>}
              {s.list && (
                <ul className="mt-3 space-y-2">
                  {s.list.map((item, j) => (
                    <li key={j} className="flex gap-2 text-slate-700">
                      <span className="text-blue-600 font-bold shrink-0">•</span>{item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-10 bg-blue-600 rounded-2xl p-8 text-center text-white">
          <h3 className="text-xl font-bold mb-2">Flexio — Control de asistencia conforme a la ley</h3>
          <p className="text-blue-100 mb-5 text-sm">Marcaje por RUT o PIN, modo offline, libro de asistencia electrónico. Desde $1.590 por trabajador.</p>
          <a href="https://wa.me/56949616038?text=Hola,%20me%20interesa%20Flexio"
            className="inline-block bg-white text-blue-600 px-6 py-3 rounded-xl font-semibold hover:bg-blue-50 transition">
            Solicitar demo sin costo
          </a>
        </div>

        {/* Otros artículos */}
        {otherPosts.length > 0 && (
          <div className="mt-12">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Sigue leyendo</h3>
            <div className="space-y-3">
              {otherPosts.map(p => (
                <a key={p.slug} href={`/blog/${p.slug}`}
                  className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-200 transition">
                  <p className="font-semibold text-slate-900 text-sm">{p.title}</p>
                </a>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
