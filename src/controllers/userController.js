// CRUD for doctor accounts (app_users). All routes require a valid JWT.
// Validation error messages are in Greek because they surface in the UI.
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const patientModel = require('../models/patientModel');

function toDto(u) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    role: u.role,
    createdAt: u.created_at
  };
}

// GET /api/users
async function listUsers(req, res, next) {
  try {
    const users = await userModel.findAll();
    return res.json(users.map(toDto));
  } catch (err) {
    return next(err);
  }
}

// POST /api/users  {username, password, fullName}
async function createUser(req, res, next) {
  try {
    const { username, password, fullName } = req.body || {};

    if (!username || !/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
      return res.status(400).json({
        error: 'Το όνομα χρήστη πρέπει να έχει 3-64 χαρακτήρες (γράμματα, αριθμοί, . _ -).'
      });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({
        error: 'Ο κωδικός πρόσβασης πρέπει να έχει τουλάχιστον 6 χαρακτήρες.'
      });
    }
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ error: 'Το ονοματεπώνυμο είναι υποχρεωτικό.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = await userModel.create({
      username,
      passwordHash,
      fullName: fullName.trim(),
      role: 'doctor'
    });
    const created = await userModel.findById(id);
    return res.status(201).json(toDto(created));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Το όνομα χρήστη υπάρχει ήδη.' });
    }
    return next(err);
  }
}

// PUT /api/users/:id  {fullName?, password?}  (username is immutable)
async function updateUser(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existing = await userModel.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Ο χρήστης δεν βρέθηκε.' });
    }

    const { fullName, password } = req.body || {};
    const changes = {};

    if (fullName !== undefined) {
      if (!fullName.trim()) {
        return res.status(400).json({ error: 'Το ονοματεπώνυμο δεν μπορεί να είναι κενό.' });
      }
      changes.fullName = fullName.trim();
    }
    if (password !== undefined && password !== '') {
      if (password.length < 6) {
        return res.status(400).json({
          error: 'Ο κωδικός πρόσβασης πρέπει να έχει τουλάχιστον 6 χαρακτήρες.'
        });
      }
      changes.passwordHash = await bcrypt.hash(password, 10);
    }

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ error: 'Δεν δόθηκαν πεδία προς ενημέρωση.' });
    }

    await userModel.update(id, changes);
    const updated = await userModel.findById(id);
    return res.json(toDto(updated));
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/users/:id  (a user cannot delete their own account)
async function deleteUser(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (id === Number(req.user.id)) {
      return res.status(400).json({
        error: 'Δεν μπορείτε να διαγράψετε τον λογαριασμό με τον οποίο είστε συνδεδεμένοι.'
      });
    }
    const ownedPatients = await patientModel.countByOwner(id);
    if (ownedPatients > 0) {
      return res.status(409).json({
        error: `Ο ιατρός έχει ${ownedPatients} καταχωρημένο(υς) ασθενή(είς). Διαγράψτε πρώτα τους ασθενείς του.`
      });
    }
    const affected = await userModel.remove(id);
    if (affected === 0) {
      return res.status(404).json({ error: 'Ο χρήστης δεν βρέθηκε.' });
    }
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
