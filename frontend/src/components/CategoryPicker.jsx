import { useState } from 'react';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { categories } from '@/data/categories.js';
import { Trash2, CircleAlert, Lightbulb, Droplets, Waves, Trees, Bug, Construction, Volume2, ShieldAlert, Building2, CloudRain, Plus } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Input } from '@/components/ui/input.jsx';
import { Button } from '@/components/ui/button.jsx';
import { buildCustomCategoryId } from '@/lib/categoryLabel.js';
const iconMap = {
    Trash2, CircleAlert, Lightbulb, Droplets, Waves, Trees, Bug, Construction, Volume2, ShieldAlert, Building2, CloudRain,
};
const CategoryPicker = ({ selected, onSelect, options = categories, allowCustom = false }) => {
    const { t } = useTranslation();
    const [customCategoryDraft, setCustomCategoryDraft] = useState('');
    const isCustomSelected = Boolean(selected?.startsWith('custom:'));
    const customCategoryLabel = isCustomSelected ? selected.replace('custom:', '') : '';

    // Get first letter for custom category icon
    const getCustomInitial = (text) => {
        return text ? text.charAt(0).toUpperCase() : '?';
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {options.map((cat) => {
                    const Icon = iconMap[cat.icon];
                    const isSelected = selected === cat.id;
                    return (
                        <button
                            key={cat.id}
                            onClick={() => onSelect(cat.id)}
                            className={cn(
                                'flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all hover:border-primary/50 hover:shadow-md active:scale-95',
                                isSelected ? 'border-primary bg-primary/10 shadow-md' : 'border-border bg-card'
                            )}
                        >
                            {Icon && <Icon className={cn('h-7 w-7', isSelected ? 'text-primary' : 'text-muted-foreground')} />}
                            <span className={cn('text-xs font-medium text-center leading-tight line-clamp-2', isSelected && 'text-primary')}>
                                {t(cat.translationKey)}
                            </span>
                        </button>
                    );
                })}

                {/* Show selected custom category as a card */}
                {isCustomSelected && customCategoryLabel && (
                    <button
                        onClick={() => onSelect(selected)}
                        className="flex flex-col items-center gap-2 rounded-xl border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/20 shadow-md p-3 transition-all hover:shadow-lg active:scale-95 relative"
                    >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white font-bold text-base shadow-md">
                            {getCustomInitial(customCategoryLabel)}
                        </div>
                        <span className="text-xs font-medium text-center leading-tight text-orange-700 dark:text-orange-400 line-clamp-2">
                            {customCategoryLabel}
                        </span>
                    </button>
                )}
            </div>

            {allowCustom ? (
                <div className={cn(
                    'rounded-2xl border-2 p-4 transition-all',
                    isCustomSelected ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' : 'border-dashed border-gray-300 bg-gray-50 dark:bg-gray-900/20'
                )}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 shadow-md">
                            <Plus className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Custom Category</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Create your own</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <Input
                            value={customCategoryDraft}
                            onChange={(event) => setCustomCategoryDraft(event.target.value)}
                            placeholder="e.g., Broken bench, Tree cutting"
                            maxLength={40}
                            className="h-11 text-base"
                        />
                        <Button
                            type="button"
                            onClick={() => {
                                const categoryId = buildCustomCategoryId(customCategoryDraft);
                                if (categoryId) {
                                    onSelect(categoryId);
                                    setCustomCategoryDraft('');
                                }
                            }}
                            disabled={!customCategoryDraft.trim()}
                            className="w-full h-11 text-base font-semibold bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                        >
                            Use Custom
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
};
export default CategoryPicker;
