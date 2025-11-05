const User = require('../models/user');
const Task = require('../models/task');

function parseJSONParam(raw, field, res) {
    if (raw == null) return undefined;
    try { return JSON.parse(raw); }
    catch (e) {
        res.status(400).json({ message: `Invalid JSON in '${field}'`, data: {} });
        return null;
    }
}

module.exports = (router) => {
    router.get('/', async (req, res, next) => {
        try {
            const where  = parseJSONParam(req.query.where, 'where', res);
            if (where === null) return;
            const sort   = parseJSONParam(req.query.sort, 'sort', res);
            if (sort === null) return;
            const select = parseJSONParam(req.query.select, 'select', res);
            if (select === null) return;
        
            const skip  = Number.isFinite(+req.query.skip)  && +req.query.skip  > 0 ? +req.query.skip  : 0;
            const limit = (req.query.limit == null)
                ? undefined
                : (Number.isFinite(+req.query.limit) && +req.query.limit > 0 ? +req.query.limit : undefined);
        
            const countOnly = String(req.query.count).toLowerCase() === 'true';
        
            if (countOnly) {
                const n = await User.countDocuments(where || {});
                return res.status(200).json({ message: 'OK', data: n });
            }
        
            const q = User.find(where || {});
            if (sort)   q.sort(sort);
            if (select) q.select(select);
            q.skip(skip);
            if (limit !== undefined) q.limit(limit);
        
            const docs = await q.exec();
            res.status(200).json({ message: 'OK', data: docs });
        } catch (err) {
            next(err);
        }
    });

    router.post('/', async (req, res, next) => {
        try {
            if (!req.body?.name || !req.body?.email) {
                return res.status(400).json({ message: 'User must have name and email', data: {} });
            }
        
            const user = await User.create({
                name: req.body.name,
                email: req.body.email,
                pendingTasks: []
            });
        
            return res.status(201).json({ message: 'User created', data: user });
        } catch (err) {
            if (err && err.code === 11000) {
                return res.status(400).json({ message: 'A user with that email already exists', data: {} });
            }
            if (err && err.name === 'ValidationError') {
                return res.status(400).json({ message: 'Invalid user data', data: {} });
            }
            next(err);
        }
    });

    router.get('/:id', async (req, res, next) => {
        try {
            const select = parseJSONParam(req.query.select, 'select', res);
            if (select === null) return;
        
            const user = await User.findById(req.params.id).select(select || {});
            if (!user) return res.status(404).json({ message: 'User not found', data: {} });
        
            return res.status(200).json({ message: 'OK', data: user });
            } catch (err) {
            if (err && err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid user id', data: {} });
            }
            next(err);
        }
    });

    router.put('/:id', async (req, res, next) => {
        try {
            if (!req.body.name || !req.body.email) {
                return res.status(400).json({ message: 'User must have name and email', data: {} });
            }
        
            const userId = req.params.id;
            const prev = await User.findById(userId);
            if (!prev) return res.status(404).json({ message: 'User not found', data: {} });
        
            const newTasks = Array.from(new Set((req.body.pendingTasks || []).map(String)));
            const oldTasks = (prev.pendingTasks || []).map(String);
            const removed  = oldTasks.filter(x => !newTasks.includes(x));
            const added    = newTasks.filter(x => !oldTasks.includes(x));
        
            if (added.length) {
                const existing = await Task.find({ _id: { $in: added } }, { _id: 1 });
                const have = new Set(existing.map(t => String(t._id)));
                const bad = added.filter(id => !have.has(id));
                if (bad.length) {
                return res.status(400).json({ message: `Invalid task id(s): ${bad.join(', ')}`, data: {} });
                }
            }
        
            if (added.length) {
                const addedTasksFull = await Task.find(
                { _id: { $in: added } },
                { _id: 1, assignedUser: 1 }
                );
                const prevOwners = [...new Set(
                addedTasksFull
                    .map(t => String(t.assignedUser || ''))
                    .filter(uid => uid && uid !== String(userId))
                )];
                if (prevOwners.length) {
                await User.updateMany(
                    { _id: { $in: prevOwners } },
                    { $pull: { pendingTasks: { $in: added } } }
                );
                }
            }
        
            const updated = await User.findByIdAndUpdate(
                userId,
                {
                name: req.body.name,
                email: req.body.email,
                pendingTasks: newTasks,
                dateCreated: prev.dateCreated
                },
                { new: true, runValidators: true, overwrite: true }
            );

            if (!updated) return res.status(404).json({ message: 'User not found', data: {} });


            await Task.updateMany(
                { assignedUser: String(userId) },
                { $set: { assignedUserName: updated.name } }
            );
        
            if (removed.length) {
                await Task.updateMany(
                { _id: { $in: removed } },
                { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
                );
            }
        
            if (added.length) {
                await Task.updateMany(
                { _id: { $in: added } },
                { $set: { assignedUser: String(userId), assignedUserName: updated.name } }
                );
            }
        
            return res.status(200).json({ message: 'User replaced', data: updated });
        } catch (err) {
            if (err && err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid user id', data: {} });
            }
            if (err && err.code === 11000) {
                return res.status(400).json({ message: 'A user with that email already exists', data: {} });
            }
            if (err && err.name === 'ValidationError') {
                return res.status(400).json({ message: 'Invalid user data', data: {} });
            }
            next(err);
        }
    });      

    router.delete('/:id', async (req, res, next) => {
        try {
            const deleted = await User.findByIdAndDelete(req.params.id);
            if (!deleted) {
                return res.status(404).json({ message: 'User not found', data: {} });
            }
        
            await Task.updateMany(
                { assignedUser: String(deleted._id) },
                { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
            );
            return res.status(204).end();
        } catch (err) {
            if (err && err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid user id', data: {} });
            }
            next(err);
        }
    });

    return router;
};
