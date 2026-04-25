import { closeMongo, pingMongo } from './mongo.js';

try {
    await pingMongo();
    console.log('MongoDB connection successful.');
} catch (error) {
    console.error('MongoDB connection failed.');
    console.error(error.message);
    process.exit(1);
} finally {
    await closeMongo();
}
