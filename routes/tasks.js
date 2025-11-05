const Task = require('../models/task');
const User = require('../models/user');

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
            const limit = req.query.limit == null
                ? 100
                : (Number.isFinite(+req.query.limit) && +req.query.limit > 0 ? +req.query.limit : 100);
        
            const countOnly = String(req.query.count).toLowerCase() === 'true';
        
            if (countOnly) {
                const n = await Task.countDocuments(where || {});
                return res.status(200).json({ message: 'OK', data: n });
            }
        
            const q = Task.find(where || {});
            if (sort)   q.sort(sort);
            if (select) q.select(select);
            q.skip(skip).limit(limit);
        
            const docs = await q.exec();
            res.status(200).json({ message: 'OK', data: docs });
        } catch (err) {
            next(err);
        }
    });

    router.post('/', async (req, res, next) => {
        try {
            if (!req.body.name || !req.body.deadline) {
                return res.status(400).json({ message: 'Task must have name and deadline', data: {} });
            }
        
            let assignedUser = req.body.assignedUser || '';
            let assignedUserName = 'unassigned';
        
            if (assignedUser) {
                const u = await User.findById(String(assignedUser));
                if (!u) {
                return res.status(400).json({ message: 'assignedUser does not exist', data: {} });
                }
                assignedUser = String(u._id);
                assignedUserName = u.name;
            }
        
            const task = await Task.create({
                name: req.body.name,
                description: req.body.description || '',
                deadline: req.body.deadline,
                completed: req.body.completed ?? false,
                assignedUser,
                assignedUserName
            });
        
            if (assignedUser) {
                await User.updateOne(
                { _id: assignedUser },
                { $addToSet: { pendingTasks: String(task._id) } }
                );
            }
        
            return res.status(201).json({ message: 'Task created', data: task });
        } catch (err) {
            if (err && err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid assignedUser id', data: {} });
            }
            next(err);
        }
    });

    router.get('/:id', async (req, res, next) => {
        try {
            const select = parseJSONParam(req.query.select, 'select', res);
            if (select === null) return;
            const task = await Task.findById(req.params.id).select(select || {});
            if (!task) return res.status(404).json({ message: 'Task not found', data: {} });
            res.status(200).json({ message: 'OK', data: task });
        } catch (err) { 
            if (err && err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid task id', data: {} });
            }
            next(err); 
        }
    });

    router.put('/:id', async (req, res, next) => {
        try {
            if (!req.body.name || !req.body.deadline) {
                return res.status(400).json({ message: 'Task must have name and deadline', data: {} });
            }
        
            const prev = await Task.findById(req.params.id);
            if (!prev) {
                return res.status(404).json({ message: 'Task not found', data: {} });
            }
        
            const oldUser = String(prev.assignedUser || '');
            let newUser = req.body.assignedUser ? String(req.body.assignedUser) : '';
            let assignedUserName = 'unassigned';
        
            if (newUser) {
                const u = await User.findById(newUser);
                if (!u) {
                return res.status(400).json({ message: 'assignedUser does not exist', data: {} });
                }
                newUser = String(u._id);
                assignedUserName = u.name;
            }
        
            const replacement = {
                name: req.body.name,
                description: req.body.description || '',
                deadline: req.body.deadline,
                completed: req.body.completed ?? false,
                assignedUser: newUser,
                assignedUserName,
                dateCreated: prev.dateCreated
            };
        
            const updated = await Task.findByIdAndUpdate(
                req.params.id,
                replacement,
                { new: true, runValidators: true, overwrite: true }
            );
            if (!updated) {
                return res.status(404).json({ message: 'Task not found', data: {} });
            }
        
            const taskId = String(updated._id);
            if (oldUser && oldUser !== newUser) {
                await User.updateOne({ _id: oldUser }, { $pull: { pendingTasks: taskId } });
            }
            if (newUser && newUser !== oldUser) {
                await User.updateOne({ _id: newUser }, { $addToSet: { pendingTasks: taskId } });
            }
        
            return res.status(200).json({ message: 'Task replaced', data: updated });
        } catch (err) {
            if (err && err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid task id', data: {} });
            }
            next(err);
        }
    });

    router.delete('/:id', async (req, res, next) => {
        try {
            const deleted = await Task.findByIdAndDelete(req.params.id);
            if (!deleted) {
                return res.status(404).json({ message: 'Task not found', data: {} });
            }
            
            if (deleted.assignedUser) {
                await User.updateOne(
                    { _id: String(deleted.assignedUser) },
                    { $pull: { pendingTasks: String(deleted._id) } }
                );
            }

            res.status(204).end();
        } catch (err) {
            if (err && err.name === 'CastError') {
                return res.status(400).json({ message: 'Invalid task id', data: {} });
            }
            next(err);
        }
    });

    return router;
};