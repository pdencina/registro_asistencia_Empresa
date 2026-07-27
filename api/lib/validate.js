/**
 * Simple input validation utility.
 * Lightweight alternative to Zod/Joi for serverless (no dependencies).
 * 
 * Usage:
 *   const { valid, errors } = validate(req.body, {
 *     email: { required: true, type: 'email' },
 *     name: { required: true, minLength: 2 },
 *     age: { type: 'number', min: 0, max: 150 },
 *   });
 */

function validate(data, schema) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Body inválido'] };
  }

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} es obligatorio`);
      continue;
    }

    // Skip optional empty fields
    if (value === undefined || value === null || value === '') continue;

    // Type checks
    if (rules.type === 'email') {
      if (typeof value !== 'string' || !value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        errors.push(`${field} no es un email válido`);
      }
    } else if (rules.type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        errors.push(`${field} debe ser un número`);
      } else {
        if (rules.min !== undefined && num < rules.min) errors.push(`${field} debe ser al menos ${rules.min}`);
        if (rules.max !== undefined && num > rules.max) errors.push(`${field} debe ser máximo ${rules.max}`);
      }
    } else if (rules.type === 'uuid') {
      if (typeof value !== 'string' || !value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        errors.push(`${field} no es un UUID válido`);
      }
    } else if (rules.type === 'date') {
      if (typeof value !== 'string' || !value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        errors.push(`${field} debe tener formato YYYY-MM-DD`);
      }
    } else if (rules.type === 'time') {
      if (typeof value !== 'string' || !value.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
        errors.push(`${field} debe tener formato HH:MM`);
      }
    }

    // String length checks
    if (typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${field} debe tener al menos ${rules.minLength} caracteres`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} debe tener máximo ${rules.maxLength} caracteres`);
      }
    }

    // Enum check
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} debe ser uno de: ${rules.enum.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Express-style validation middleware.
 * Returns true if validation failed (already sent 400 response).
 */
function validateRequest(req, res, schema) {
  const { valid, errors } = validate(req.body, schema);
  if (!valid) {
    res.status(400).json({ error: errors[0], errors });
    return true; // validation failed
  }
  return false; // validation passed
}

module.exports = { validate, validateRequest };
