# Adapt the existing BibTeX data to AcadHomepage's native paper-box markup.
require "bibtex"

module AcademicSite
  class Publications < Jekyll::Generator
    safe true
    priority :normal

    def generate(site)
      bibliography = BibTeX.open(File.join(site.source, "_bibliography", "papers.bib"))
      site.data["publications"] = bibliography.entries.values.map do |entry|
        fields = entry.fields.each_with_object({}) { |(key, value), result| result[key.to_s] = value.to_s }
        fields["key"] = entry.key.to_s
        fields["authors"] = (entry[:author] || []).map do |name|
          { "first" => name.first.to_s, "last" => name.last.to_s, "self" => name.last.to_s.delete("*") == "Zou" }
        end
        fields
      end.sort_by { |paper| -paper["year"].to_i }
    end
  end
end
