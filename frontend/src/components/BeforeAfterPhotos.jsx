import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function BeforeAfterPhotos({ beforeImage, afterImage, title = 'Before & After' }) {
    const [showAfter, setShowAfter] = useState(false);

    if (!beforeImage || !afterImage) {
        return null;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* Side by side on desktop */}
                    <div className="hidden md:grid md:grid-cols-2 md:gap-4">
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">Before</p>
                            <img 
                                src={beforeImage} 
                                alt="Before" 
                                className="w-full h-64 object-cover rounded-lg border-2 border-border" 
                            />
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-secondary">After (Resolved)</p>
                            <img 
                                src={afterImage} 
                                alt="After" 
                                className="w-full h-64 object-cover rounded-lg border-2 border-secondary" 
                            />
                        </div>
                    </div>

                    {/* Slider on mobile */}
                    <div className="md:hidden">
                        <div className="relative">
                            <img 
                                src={showAfter ? afterImage : beforeImage} 
                                alt={showAfter ? 'After' : 'Before'} 
                                className="w-full h-64 object-cover rounded-lg border-2 border-border transition-all" 
                            />
                            <div className="absolute top-2 left-2 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium">
                                {showAfter ? 'After (Resolved)' : 'Before'}
                            </div>
                        </div>
                        <div className="flex items-center justify-center gap-2 mt-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAfter(false)}
                                disabled={!showAfter}
                                className="gap-1"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Before
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAfter(true)}
                                disabled={showAfter}
                                className="gap-1"
                            >
                                After
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-lg bg-secondary/10 p-4 text-center">
                        <p className="text-sm font-medium text-secondary">Issue Resolved</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Thank you for reporting. The issue has been successfully resolved.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
