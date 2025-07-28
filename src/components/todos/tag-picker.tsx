"use client";

import { useState } from "react";
import { useAuthQuery } from "@/lib/convex/hooks";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Check, Tags, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagPickerProps {
  selectedTagIds: Id<"tags">[];
  onTagsChange: (tagIds: Id<"tags">[]) => void;
  disabled?: boolean;
}

export function TagPicker({
  selectedTagIds,
  onTagsChange,
  disabled,
}: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: tags = [] } = useAuthQuery(api.tags.list, {});

  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag._id));

  const toggleTag = (tagId: Id<"tags">) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagsChange([...selectedTagIds, tagId]);
    }
  };

  const removeTag = (tagId: Id<"tags">) => {
    onTagsChange(selectedTagIds.filter((id) => id !== tagId));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal"
            disabled={disabled}
          >
            <Tags className="h-4 w-4" />
            {selectedTags.length > 0 ? (
              <span>
                {selectedTags.length} tag{selectedTags.length !== 1 ? "s" : ""}{" "}
                selected
              </span>
            ) : (
              <span className="text-muted-foreground">Select tags...</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Search tags..." />
            <CommandList>
              <CommandEmpty>No tags found.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => (
                  <CommandItem
                    key={tag._id}
                    value={tag.name}
                    onSelect={() => toggleTag(tag._id)}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        selectedTagIds.includes(tag._id)
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className={cn("h-4 w-4")} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span>{tag.name}</span>
                      {tag.usageCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          ({tag.usageCount})
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <Badge
              key={tag._id}
              variant="secondary"
              className="pl-2 pr-1"
              style={{
                backgroundColor: tag.color + "20",
                color: tag.color,
                borderColor: tag.color,
              }}
            >
              {tag.name}
              <button
                type="button"
                className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                onClick={() => removeTag(tag._id)}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
