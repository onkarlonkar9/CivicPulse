import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { categories } from '@/data/categories.js';
import { Trash2, CircleAlert, Lightbulb, Droplets, Waves, Trees, Bug, Construction, Volume2, ShieldAlert, Building2, CloudRain } from 'lucide-react';
import { cn } from '@/lib/utils.js';
const iconMap = {
    Trash2, CircleAlert, Lightbulb, Droplets, Waves, Trees, Bug, Construction, Volume2, ShieldAlert, Building2, CloudRain,
};
const CategoryPicker = ({ selected, onSelect, options = categories }) => {
    const { t } = useTranslation();

    return (
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
        </div>
    );
};
export default CategoryPicker;
