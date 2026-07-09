import { useState } from 'react';
import { Shield, Users, Clock, MapPin, Camera, BarChart3, Smartphone, CheckCircle, ArrowRight, Menu, X } from 'lucide-react';

export default function LandingPage() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [billingCycle, setBillingCycle] = useState('monthly'); // monthly | annual

  const plans = [
    {
      name: 'Básico',
      price: billingCycle === 'monthly' ? '39.990' : '31.990',
      period: '/mes',
      description: 'Ideal para PYMEs y equipos pequeños',
      features: [
        'Hasta 30 colaboradores',
        '1 dispositivo',
        'Reconocimiento facial',
        'Reportes básicos',
        'Soporte por email',
        'Almacenamiento 5 GB',
      ],
      cta: 'Solicitar demo',
      highlighted: false,
    },
    {
      name: 'Profesional',
      price: billingCycle === 'monthly' ? '79.990' : '63.990',
      period: '/mes',
      description: 'Para empresas en crecimiento',
      features: [
        'Hasta 100 colaboradores',
        '3 dispositivos',
        'Reconocimiento facial avanzado',
        'Reportes y exportación Excel',
        'Webhooks e integraciones',
        'Geolocalización de registros',
        'Soporte prioritario',
        'Almacenamiento 20 GB',
      ],
      cta: 'Solicitar demo',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: '149.990',
      period: '/mes',
      description: 'Para grandes organizaciones',
      features: [
        'Hasta 300 colaboradores',
        '10 dispositivos',
        'Multi-sucursal',
        'API completa',
        'Exportación Excel y reportes avanzados',
        'SLA 99.9% uptime',
        'Soporte dedicado',
        'Almacenamiento ilimitado',
      ],
      cta: 'Solicitar demo',
      highlighted: false,
    },
    {
      name: 'Corporativo',
      price: 'A medida',
      period: '',
      description: 'Para operaciones complejas',
      features: [
        'Colaboradores ilimitados',
        'Dispositivos ilimitados',
        'Personalización de marca',
        'Implementación asistida',
        'Account manager dedicado',
        'SLA personalizado',
        'Integraciones a medida',
        'Facturación especial',
      ],
      cta: 'Conversemos',
      highlighted: false,
    },
  ];

  const features = [
    {
      icon: <Camera className="w-6 h-6" />,
      title: 'Reconocimiento Facial',
      description: 'Registro de asistencia mediante IA facial. Sin contacto, sin tarjetas, sin fraudes.',
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: 'Control de Horarios',
      description: 'Gestiona turnos, atrasos y salidas anticipadas. Alertas automáticas.',
    },
    {
      icon: <MapPin className="w-6 h-6" />,
      title: 'Geolocalización',
      description: 'Verifica que el registro se realice desde la ubicación autorizada.',
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: 'Reportes en Tiempo Real',
      description: 'Dashboard con métricas de asistencia, atrasos y ausencias al instante.',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Cumplimiento Legal',
      description: 'Cumple con la Ley 21.719 de datos personales y biométricos en Chile.',
    },
    {
      icon: <Smartphone className="w-6 h-6" />,
      title: 'Multi-dispositivo',
      description: 'Funciona en iPads, tablets Android, celulares y cualquier dispositivo con cámara.',
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-md border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img src="/logo-flexio.svg" alt="Flexio" className="h-8" />
              <span className="font-bold text-gray-900 text-lg">Flexio</span>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">Funcionalidades</a>
              <a href="#pricing" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">Precios</a>
              <a href="#legal" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">Seguridad</a>
              <a href="/app" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">Iniciar sesión</a>
              <a href="#pricing" className="px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors">
                Solicitar demo
              </a>
            </div>

            {/* Mobile menu button */}
            <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2">
              {mobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
            <a href="#features" className="block text-gray-600 py-2">Funcionalidades</a>
            <a href="#pricing" className="block text-gray-600 py-2">Precios</a>
            <a href="#legal" className="block text-gray-600 py-2">Seguridad</a>
            <a href="/app" className="block text-gray-600 py-2">Iniciar sesión</a>
            <a href="https://wa.me/56949616038?text=Hola%2C%20me%20interesa%20Flexio%20para%20mi%20empresa" target="_blank" rel="noopener noreferrer" className="block w-full text-center px-5 py-2.5 bg-primary-600 text-white rounded-xl font-medium">
              Solicitar demo
            </a>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-full text-sm font-medium mb-6">
            <CheckCircle className="w-4 h-4" />
            Cumple con Ley 21.719 de Protección de Datos
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Control de asistencia con{' '}
            <span className="text-primary-600">reconocimiento facial</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10">
            Elimina el fraude en el registro de asistencia. Tu equipo marca con su rostro, 
            sin contacto ni tarjetas. Reportes en tiempo real para tu empresa.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="https://wa.me/56949616038?text=Hola%2C%20me%20interesa%20Flexio%20para%20mi%20empresa" target="_blank" rel="noopener noreferrer" className="px-8 py-4 bg-primary-600 text-white font-semibold rounded-2xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 text-lg flex items-center justify-center gap-2">
              Solicitar demo gratuita
              <ArrowRight className="w-5 h-5" />
            </a>
            <a href="#features" className="px-8 py-4 bg-gray-100 text-gray-700 font-semibold rounded-2xl hover:bg-gray-200 transition-all text-lg">
              Ver funcionalidades
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-400">15 días gratis · Sin tarjeta de crédito · Cancela cuando quieras</p>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-12 bg-gray-50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-500 mb-6">Empresas que confían en Flexio</p>
          <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
            <span className="text-xl font-bold text-gray-400">Constructora Acme</span>
            <span className="text-xl font-bold text-gray-400">Logística Sur</span>
            <span className="text-xl font-bold text-gray-400">Retail Plus</span>
            <span className="text-xl font-bold text-gray-400">Minera Andina</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Todo lo que necesitas para gestionar asistencia
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Una plataforma completa que reemplaza reloj control, huelleros y tarjetas de proximidad.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <div key={i} className="p-6 rounded-2xl border border-gray-100 hover:border-primary-200 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-gray-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Implementación en minutos
            </h2>
            <p className="text-lg text-gray-500">3 pasos para tener tu sistema funcionando</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Crea tu cuenta', desc: 'Regístrate y configura tu empresa en menos de 5 minutos.' },
              { step: '2', title: 'Registra colaboradores', desc: 'Sube la foto de cada colaborador para el reconocimiento facial.' },
              { step: '3', title: 'Configura el dispositivo', desc: 'Autoriza una tablet o celular con cámara. Listo para marcar.' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-14 h-14 bg-primary-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Planes transparentes, sin letra chica
            </h2>
            <p className="text-lg text-gray-500 mb-8">Todos los planes incluyen 15 días de prueba gratis</p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-3 bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${billingCycle === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
              >
                Mensual
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${billingCycle === 'annual' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
              >
                Anual <span className="text-primary-600 text-xs">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, i) => (
              <div
                key={i}
                className={`rounded-2xl p-8 ${
                  plan.highlighted
                    ? 'bg-primary-600 text-white ring-4 ring-primary-200 scale-105'
                    : 'bg-white border border-gray-200'
                }`}
              >
                <h3 className={`text-lg font-semibold mb-1 ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm mb-4 ${plan.highlighted ? 'text-primary-100' : 'text-gray-500'}`}>
                  {plan.description}
                </p>
                <div className="mb-6">
                  <span className={`text-4xl font-bold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                    {plan.price === 'A medida' ? plan.price : `$${plan.price}`}
                  </span>
                  <span className={`text-sm ${plan.highlighted ? 'text-primary-200' : 'text-gray-500'}`}>
                    {plan.period}
                  </span>
                  {billingCycle === 'annual' && plan.name !== 'Enterprise' && (
                    <p className={`text-xs mt-1 ${plan.highlighted ? 'text-primary-200' : 'text-gray-400'}`}>
                      Facturado anualmente
                    </p>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <CheckCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-primary-200' : 'text-primary-500'}`} />
                      <span className={plan.highlighted ? 'text-primary-50' : 'text-gray-600'}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={`https://wa.me/56949616038?text=Hola%2C%20me%20interesa%20el%20plan%20${encodeURIComponent(plan.name)}%20de%20Flexio`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all text-center block ${
                    plan.highlighted
                      ? 'bg-white text-primary-600 hover:bg-primary-50'
                      : 'bg-primary-600 text-white hover:bg-primary-700'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400 mt-8">
            Precios en CLP (pesos chilenos) + IVA. Cancela en cualquier momento.
          </p>
        </div>
      </section>

      {/* Legal / Security */}
      <section id="legal" className="py-20 bg-gray-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Seguridad y cumplimiento normativo
          </h2>
          <p className="text-lg text-gray-500 mb-12">
            Tus datos y los de tus colaboradores están protegidos bajo los más altos estándares.
          </p>
          <div className="grid sm:grid-cols-2 gap-6 text-left">
            {[
              { title: 'Ley 21.719', desc: 'Cumplimiento total con la nueva ley de protección de datos personales de Chile.' },
              { title: 'Ley 19.628', desc: 'Datos biométricos tratados como datos sensibles con consentimiento explícito.' },
              { title: 'Encriptación', desc: 'Datos en tránsito (TLS 1.3) y en reposo (AES-256) protegidos.' },
              { title: 'Derechos ARCO', desc: 'Acceso, rectificación, cancelación y oposición garantizados para cada colaborador.' },
            ].map((item, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary-500" />
                  {item.title}
                </h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Listo para modernizar tu control de asistencia?
          </h2>
          <p className="text-lg text-gray-500 mb-8">
            Únete a las empresas que ya eliminaron el fraude y automatizaron sus reportes.
          </p>
          <a href="https://wa.me/56949616038?text=Hola%2C%20quiero%20probar%20Flexio%20en%20mi%20empresa" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 text-white font-semibold rounded-2xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 text-lg">
            Comenzar prueba de 15 días
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/logo-flexio.svg" alt="Flexio" className="h-6 brightness-200" />
                <span className="font-bold text-white">Flexio</span>
              </div>
              <p className="text-sm">Sistema de control de asistencia con reconocimiento facial para empresas en Chile.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Producto</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Funcionalidades</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Precios</a></li>
                <li><a href="#legal" className="hover:text-white transition-colors">Seguridad</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/legal/terms" className="hover:text-white transition-colors">Términos de Servicio</a></li>
                <li><a href="/legal/privacy" className="hover:text-white transition-colors">Política de Privacidad</a></li>
                <li><a href="/legal/dpa" className="hover:text-white transition-colors">Acuerdo de Datos (DPA)</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Contacto</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="https://wa.me/56949616038" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    +56 9 4961 6038 (WhatsApp)
                  </a>
                </li>
                <li>Santiago, Chile</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} Flexio SpA. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>

      {/* Botón flotante WhatsApp */}
      <a
        href="https://wa.me/56949616038?text=Hola%2C%20me%20interesa%20Flexio"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30 transition-all hover:scale-110"
        title="Escríbenos por WhatsApp"
      >
        <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>
    </div>
  );
}
