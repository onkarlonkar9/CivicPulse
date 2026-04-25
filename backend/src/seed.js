import { categories } from '../../frontend/src/data/categories.js';

export const seedIssues = [];

export const categoryMap = new Map(categories.map((category) => [category.id, category]));

export const seedUsers = [];
